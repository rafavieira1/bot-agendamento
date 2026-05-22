export function buildEnvelope({ securityHeaderXml, bodyXml }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.soc.age.com/">
<soapenv:Header>
${securityHeaderXml}
</soapenv:Header>
<soapenv:Body>
${bodyXml}
</soapenv:Body>
</soapenv:Envelope>`;
}
