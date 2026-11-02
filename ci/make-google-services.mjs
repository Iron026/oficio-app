/**
 * Gera android/app/google-services.json a partir de variáveis do repositório
 * (alternativa a colar o arquivo inteiro num segredo — mais fácil pelo celular).
 * Valores necessários (todos copiáveis no console do Firebase):
 *   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_MESSAGING_SENDER_ID (nº do projeto),
 *   FIREBASE_ANDROID_APP_ID, FIREBASE_WEB_CLIENT_ID e uma chave de API
 *   (FIREBASE_ANDROID_API_KEY ou, na falta, VITE_FIREBASE_API_KEY).
 */
import { writeFileSync } from 'node:fs';

const env = process.env;
const need = {
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  projectNumber: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_ANDROID_APP_ID,
  webClientId: env.FIREBASE_WEB_CLIENT_ID,
  apiKey: env.FIREBASE_ANDROID_API_KEY || env.VITE_FIREBASE_API_KEY,
};
const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.log(`Configuração Android incompleta (faltando: ${missing.join(', ')}).`);
  process.exit(2);
}
const web = { client_id: need.webClientId, client_type: 3 };
const json = {
  project_info: {
    project_number: need.projectNumber,
    project_id: need.projectId,
    storage_bucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${need.projectId}.firebasestorage.app`,
  },
  client: [
    {
      client_info: { mobilesdk_app_id: need.appId, android_client_info: { package_name: 'io.github.iron026.oficio' } },
      oauth_client: [web],
      api_key: [{ current_key: need.apiKey }],
      services: { appinvite_service: { other_platform_oauth_client: [web] } },
    },
  ],
  configuration_version: '1',
};
writeFileSync('android/app/google-services.json', JSON.stringify(json, null, 2));
console.log('google-services.json gerado a partir das variáveis do repositório.');
