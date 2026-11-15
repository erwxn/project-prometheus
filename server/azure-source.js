/** Builds one complete Azure publication URL from server-owned configuration. */
function azureSource(env = process.env) {
  // Account/container details alone are not a publication; preserve preview mode.
  if (!env.AZURE_GOLD_BLOB) return null;
  const account = env.AZURE_STORAGE_ACCOUNT;
  const container = env.AZURE_GOLD_CONTAINER;
  if (!/^[a-z0-9]{3,24}$/.test(account || '')) throw Error('Set a valid AZURE_STORAGE_ACCOUNT.');
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(container || '') || container.includes('--')) throw Error('Set a valid AZURE_GOLD_CONTAINER.');
  const endpoint = new URL(env.AZURE_BLOB_ENDPOINT || `https://${account}.blob.core.windows.net`);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== `${account}.blob.core.windows.net` || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw Error('AZURE_BLOB_ENDPOINT must be the HTTPS Blob endpoint for the configured account.');
  }
  const segments = env.AZURE_GOLD_BLOB.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw Error('AZURE_GOLD_BLOB must be a file path inside the container.');
  endpoint.pathname = `/${container}/${segments.map(encodeURIComponent).join('/')}`;
  if (env.AZURE_STORAGE_SAS_TOKEN) {
    const token = env.AZURE_STORAGE_SAS_TOKEN.replace(/^\?/, '');
    const params = new URLSearchParams(token);
    const permissions = params.get('sp') || '';
    if (!params.get('sig') || !/^r?l?$/.test(permissions) || !permissions.includes('r')) throw Error('Use an Azure SAS token with read-only permissions (r or rl).');
    endpoint.search = token;
  }
  return endpoint;
}

module.exports = { azureSource };
