import { prisma } from "@/lib/prisma";
import type { Prisma, UserRole } from "@prisma/client";

export type CustomFieldDefinition={id:string;key:string;label:string;section:string;type:string;required:boolean;showInRegistration:boolean;showOnProfile:boolean;showInReports:boolean;visibilityRoles:string[];options:string[]|null;condition:{field?:string;equals?:unknown}|null;displayOrder:number;active:boolean};

export async function getCustomFieldDefinitions(registration=false){
  return prisma.$queryRawUnsafe<CustomFieldDefinition[]>(`SELECT "id","key","label","section","type","required","showInRegistration","showOnProfile","showInReports","visibilityRoles","options","condition","displayOrder","active" FROM "StudentCustomFieldDefinition" WHERE "active"=true ${registration?'AND "showInRegistration"=true':''} ORDER BY "section","displayOrder","label"`);
}

export async function generateGrNumber(tx:Prisma.TransactionClient){
  const rows=await tx.$queryRawUnsafe<{prefix:string;nextNumber:number;padding:number}[]>(`SELECT "prefix","nextNumber","padding" FROM "StudentRegistryConfig" WHERE "id"='default' FOR UPDATE`);
  const cfg=rows[0]||{prefix:"GR-",nextNumber:1,padding:5};
  const grNumber=`${cfg.prefix}${String(cfg.nextNumber).padStart(cfg.padding,"0")}`;
  if(rows[0]) await tx.$executeRawUnsafe(`UPDATE "StudentRegistryConfig" SET "nextNumber"="nextNumber"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"='default'`);
  return grNumber;
}

export async function saveCustomValues(tx:Prisma.TransactionClient,registryId:string,values:Record<string,unknown>,role?:UserRole){
  const defs=(await getCustomFieldDefinitions()).filter(def=>!role||def.visibilityRoles.includes(role));
  for(const def of defs){
    if(!(def.key in values))continue;
    const value=values[def.key]===null||values[def.key]===undefined?null:String(typeof values[def.key]==="object"?JSON.stringify(values[def.key]):values[def.key]);
    await tx.$executeRawUnsafe(`INSERT INTO "StudentCustomFieldValue" ("id","studentRegistryId","fieldId","value") VALUES ($1,$2,$3,$4) ON CONFLICT ("studentRegistryId","fieldId") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=CURRENT_TIMESTAMP`,crypto.randomUUID(),registryId,def.id,value);
  }
}
