const fetch = require('node-fetch');
module.exports = async function request(url, options = {}) {
  const response = await fetch(url, { timeout: 30000, ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).hostname}`);
  return response;
};
