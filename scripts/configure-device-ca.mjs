import { rootCertificates } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const roots = rootCertificates.filter((c) =>
  /GTS Root R[1-4]|ISRG Root X[12]/.test(new X509Certificate(c).subject),
);
if (roots.length < 5) throw new Error('Missing public trust roots.');
writeFileSync(
  new URL('../../ESP32_Water_Level_Detector/include/cloud_ca.h', import.meta.url),
  '#pragma once\n// Public Mozilla trust roots from Node TLS: GTS R1-R4 and ISRG X1-X2.\nconstexpr const char* CLOUD_CA=R"PEM(' +
    roots.join('\n') +
    '\n)PEM";\n',
);
console.log(`Saved ${roots.length} public CA certificates.`);
