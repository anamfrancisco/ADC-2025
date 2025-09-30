// middleware/auth.js
exports.isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
};

exports.authorizeRoles = (roles = []) => {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (!roles.includes(user.role)) return res.status(403).send("Sem permissão");
    next();
  };
};
