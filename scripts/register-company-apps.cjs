require('dotenv/config');
const mysql = require('mysql2/promise');
const applications = require('../src/company/applications.json');
const issuer = 'entroqi-company-v1';

async function registerCompanyApplications(connection) {
  await connection.beginTransaction();
  try {
    // A company installation must start in its own database. Never rename or
    // purge someone else's applications or their financial records in place.
    const codes = applications.map(item => item.application);
    const [foreign] = await connection.query('select code from applications where code not in (?)', [codes]);
    if (foreign.length) throw new Error('Non-company applications exist: use a clean Entroqi database; no legacy records were changed');
    for (const item of [...applications].sort((a, b) => a.application.localeCompare(b.application))) {
      await connection.execute('insert into applications (code,name,description,status) values (?,?,?,?) on duplicate key update code=code', [item.application, item.name, 'Entroqi company application; registration does not enable paid access', 'active']);
      const [registered] = await connection.execute('select issuer,product_key,catalog_id,access_key,base_path,price_product_code from company_application_products where application_code=? for update', [item.application]);
      const expected = { issuer, product_key: item.productKey, catalog_id: item.catalogId, access_key: item.accessKey, base_path: item.basePath, price_product_code: item.priceProductCode };
      if (registered[0] && Object.keys(expected).some(key => registered[0][key] !== expected[key])) throw new Error('Registered product mapping changed; explicit migration required');
      if (!registered[0]) await connection.execute('insert into company_application_products (application_code,issuer,product_key,catalog_id,access_key,base_path,price_product_code) values (?,?,?,?,?,?,?)', [item.application, issuer, item.productKey, item.catalogId, item.accessKey, item.basePath, item.priceProductCode]);
      const [bindings] = await connection.execute('select issuer from customer_application_namespaces where application=?', [item.application]);
      if (bindings[0] && bindings[0].issuer !== issuer) throw new Error('Application identity belongs to another issuer; explicit migration required');
    }
    await connection.commit();
    return applications;
  } catch (error) { await connection.rollback(); throw error; }
}
async function main() {
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE || 'entroqi_billing', user: process.env.MYSQL_USER || 'credits', password: process.env.MYSQL_PASSWORD || '' });
  try { for (const item of await registerCompanyApplications(connection)) console.log('Registered: ' + item.application + ' / ' + item.accessKey + ' (commerce disabled)'); }
  finally { await connection.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { registerCompanyApplications, applications };
