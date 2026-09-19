import fs from "node:fs";
const w=fs.readFileSync(".github/workflows/production-migration-status.yml","utf8");
const checks=[
  ["status workflow is manual-only",w.includes("workflow_dispatch:")&&!w.includes("push:")&&!w.includes("pull_request:")],
  ["status workflow uses production secret",w.includes("PRODUCTION_DATABASE_URL")],
  ["status workflow is read-only Prisma status",w.includes("prisma migrate status")&&!w.includes("migrate deploy")&&!w.includes("migrate resolve")],
];
let failed=false;
for(const [n,ok] of checks){console.log((ok?"PASS":"FAIL")+": "+n);failed ||= !ok;}
if(failed)process.exit(1);
