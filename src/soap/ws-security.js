import crypto from 'node:crypto';

export function computePasswordDigest(nonceBytes, created, password) {
  const buf = Buffer.concat([
    nonceBytes,
    Buffer.from(created, 'utf8'),
    Buffer.from(password, 'utf8'),
  ]);
  return crypto.createHash('sha1').update(buf).digest('base64');
}

export function buildSecurityHeader({ codigoUsuario, password, now = new Date() }) {
  const created = now.toISOString();
  const expires = new Date(now.getTime() + 60_000).toISOString();
  const nonceBytes = crypto.randomBytes(16);
  const nonceB64 = nonceBytes.toString('base64');
  const passwordDigest = computePasswordDigest(nonceBytes, created, password);
  const tsId = 'TS-' + crypto.randomBytes(8).toString('hex');
  const tokenId = 'UT-' + crypto.randomBytes(8).toString('hex');

  return `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <wsu:Timestamp wsu:Id="${tsId}">
    <wsu:Created>${created}</wsu:Created>
    <wsu:Expires>${expires}</wsu:Expires>
  </wsu:Timestamp>
  <wsse:UsernameToken wsu:Id="${tokenId}">
    <wsse:Username>U${codigoUsuario}</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${passwordDigest}</wsse:Password>
    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceB64}</wsse:Nonce>
    <wsu:Created>${created}</wsu:Created>
  </wsse:UsernameToken>
</wsse:Security>`;
}
