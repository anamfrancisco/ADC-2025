// utils/applyDefaults.js
function applyDefaults(user = {}) {
  const defaults = [
    'username', 'email', 'name', 'telephone',
    'profile', 'occupation', 'workplace', 'address',
    'postal_code', 'nif', 'status', 'role'
  ];

  const copy = { ...user };
  for (const key of defaults) {
    if (!copy[key]) copy[key] = "NOT DEFINED";
  }
  return copy;
}

module.exports = applyDefaults;
