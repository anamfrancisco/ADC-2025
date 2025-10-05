// controllers/worksheetController.js
const { db } = require('../config/firebase');

const proj4 = require("proj4");

proj4.defs("EPSG:3763", "+proj=tmerc +lat_0=39.66825833333333 +lon_0=-8.133108333333333 +k=1 +x_0=200000 +y_0=300000 +ellps=GRS80 +units=m +no_defs");

const convertCoord = ([x, y]) => proj4("EPSG:3763", "EPSG:4326", [x, y]);


exports.list = async (req, res) => {
  try {
    const snapshot = await db.collection('worksheets').orderBy('createdAt', 'desc').get();
    const worksheets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.render('worksheets', { worksheets, currentUser: req.session.user || null });
  } catch (err) {
    console.error("Erro ao buscar worksheets:", err);
    res.status(500).send("Erro interno ao carregar worksheets");
  }
};

exports.importForm = (req, res) => {
  res.render('worksheets-import', { currentUser: req.session.user, error: null });
};

exports.import = async (req, res) => {
  try {
    if (!req.file) throw new Error("Ficheiro GeoJSON não enviado.");
    const geojson = JSON.parse(req.file.buffer.toString('utf8'));

    if (!geojson.metadata) throw new Error("Ficheiro sem 'metadata'.");
    if (!Array.isArray(geojson.features)) throw new Error("Ficheiro sem 'features'.");

    const ops = geojson.metadata.operations || [];
    if (ops.length > 5) throw new Error("Número de operações maior que 5.");

    const docId = String(geojson.metadata.id || "");
    const ref = docId ? db.collection("worksheets").doc(docId) : db.collection("worksheets").doc();

    if (docId) {
      const existing = await ref.get();
      if (existing.exists) {
        return res.render("worksheets-import", { currentUser: req.session.user, error: `Worksheet com id ${docId} já existe.` });
      }
    }

    await ref.set({
      op_code: "IMP-FO",
      operacao: "IMPORTAÇÃO de uma folha de obra",
      descricao: "Importação de GeoJSON com uma folha de obra",
      ref_recom: "MH",
      metadata: geojson.metadata,
      crs: geojson.crs || null,
      createdAt: new Date(),
      createdBy: req.session.user.uid,
      createdByRole: req.session.user.role
    });

    const batch = db.batch();
    geojson.features.forEach((f, idx) => {
      const fRef = ref.collection("features").doc(String(idx));
      let converted = [];

      if (f.geometry?.type === "Polygon") {
        converted = f.geometry.coordinates.map(ring =>
          ring.map(([x, y]) => {
            const [lon, lat] = proj4("EPSG:3763", "EPSG:4326", [x, y]);
            return [lon, lat];
          })
        );
      } else if (f.geometry?.type === "Point") {
        const [x, y] = f.geometry.coordinates;
        const [lon, lat] = proj4("EPSG:3763", "EPSG:4326", [x, y]);
        converted = [lon, lat];
      }


      const featureDoc = {
        type: f.type,
        properties: f.properties || {},
        geometryType: f.geometry?.type || null,
        coordinates: JSON.stringify(converted)
      };

      batch.set(fRef, featureDoc);
    });
    await batch.commit();

    return res.redirect("/worksheets?imported=1");
  } catch (err) {
    console.error("Erro ao importar worksheet:", err);
    res.render("worksheets-import", { currentUser: req.session.user, error: err.message });
  }
};

exports.view = async (req, res) => {
  try {
    const { id } = req.params;
    const ref = db.collection("worksheets").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).send("Worksheet não encontrada");

    const worksheet = doc.data();
    const snapshot = await ref.collection("features").get();
    const features = snapshot.docs.map(d => {
      const f = d.data();
      return {
        id: d.id,
        type: f.type || "Feature",
        geometryType: f.geometryType || null,
        coordinates: JSON.parse(f.coordinates || "[]"),
        properties: f.properties || {}
      };
    });

    const geojson = {
      type: "FeatureCollection",
      metadata: worksheet.metadata,
      features: features.map(f => ({
        type: "Feature",
        properties: f.properties,
        geometry: { type: f.geometryType, coordinates: f.coordinates }
      }))
    };

    res.render("worksheet-view", { worksheet, features, geojson, currentUser: req.session.user });
  } catch (err) {
    console.error("Erro ao carregar worksheet:", err);
    res.status(500).send("Erro interno ao carregar worksheet");
  }
};

exports.editForm = async (req, res) => {
  try {
    const wsRef = db.collection("worksheets").doc(req.params.id);
    const doc = await wsRef.get();
    if (!doc.exists) return res.status(404).send("Worksheet não encontrada");

    const worksheet = { id: doc.id, ...doc.data() };
    const featuresSnap = await wsRef.collection("features").get();
    const features = featuresSnap.docs.map(f => ({ id: f.id, ...f.data() }));

    res.render("worksheet-edit", { currentUser: req.session.user, worksheet, features });
  } catch (err) {
    console.error("Erro ao abrir edit worksheet:", err);
    res.status(500).send("Erro interno");
  }
};

exports.edit = async (req, res) => {
  try {
    const wsRef = db.collection("worksheets").doc(req.params.id);
    await wsRef.update({
      "metadata.service_provider": req.body.service_provider || null,
      "metadata.issue_date": req.body.issue_date || null,
      "metadata.starting_date": req.body.starting_date || null,
      "metadata.finishing_date": req.body.finishing_date || null,
      updatedAt: new Date(),
      updatedBy: req.session.user.uid
    });
    res.redirect(`/worksheets/${req.params.id}`);
  } catch (err) {
    console.error("Erro ao atualizar worksheet:", err);
    res.status(500).send("Erro interno");
  }
};

exports.deleteFeature = async (req, res) => {
  try {
    const wsRef = db.collection("worksheets").doc(req.params.id);
    await wsRef.collection("features").doc(req.params.fid).delete();
    res.redirect(`/worksheets/${req.params.id}/edit`);
  } catch (err) {
    console.error("Erro ao remover feature:", err);
    res.status(500).send("Erro interno");
  }
};

exports.deleteWorksheet = async (req, res) => {
  try {
    const wsId = req.params.id;
    const wsRef = db.collection("worksheets").doc(wsId);
    const wsDoc = await wsRef.get();
    if (!wsDoc.exists) return res.status(404).send("Worksheet não encontrada");

    const featuresSnap = await wsRef.collection("features").get();
    const batchFeatures = db.batch();
    featuresSnap.forEach(doc => batchFeatures.delete(doc.ref));
    if (!featuresSnap.empty) await batchFeatures.commit();

    const execSnap = await db.collection("executionSheets").where("worksheetId", "==", wsId).get();
    const batchExec = db.batch();
    execSnap.forEach(doc => batchExec.delete(doc.ref));
    if (!execSnap.empty) await batchExec.commit();

    await wsRef.delete();
    res.redirect("/worksheets?deleted=1");
  } catch (err) {
    console.error("Erro ao apagar worksheet:", err);
    res.status(500).send("Erro interno ao apagar worksheet");
  }
};
