import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const WRITE_ROLES=["SUPER_ADMIN","ADMIN"] as const;
const text=(v:unknown)=>typeof v==='string'?v.trim():'';

export async function GET(){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:'Authentication required.'},{status:401});
 if(!roleAllowed(user.role,WRITE_ROLES as never))return NextResponse.json({error:'You do not have permission to view batch promotion history.'},{status:403});
 try{
  const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT bp.*,ss.name AS "sourceSessionName",sg.name AS "sourceGradeName",sx.name AS "sourceSectionName",ts.name AS "targetSessionName",tg.name AS "targetGradeName",tx.name AS "targetSectionName" FROM "BatchPromotion" bp JOIN "AcademicSession" ss ON ss.id=bp."sourceSessionId" JOIN "AcademicGrade" sg ON sg.id=bp."sourceGradeId" JOIN "AcademicSection" sx ON sx.id=bp."sourceSectionId" JOIN "AcademicSession" ts ON ts.id=bp."targetSessionId" JOIN "AcademicGrade" tg ON tg.id=bp."targetGradeId" JOIN "AcademicSection" tx ON tx.id=bp."targetSectionId" ORDER BY bp."createdAt" DESC LIMIT 50`);
  return NextResponse.json({promotions:rows});
 }catch(e){console.error(e);return NextResponse.json({error:'Unable to load promotion history.'},{status:500})}
}

export async function POST(request:NextRequest){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:'Authentication required.'},{status:401});
 if(!roleAllowed(user.role,WRITE_ROLES as never))return NextResponse.json({error:'You do not have permission to promote students.'},{status:403});
 try{
  const b=await request.json(); const sourceSectionId=text(b.sourceSectionId),targetSectionId=text(b.targetSectionId),note=text(b.note).slice(0,1000);
  if(!sourceSectionId||!targetSectionId||sourceSectionId===targetSectionId)return NextResponse.json({error:'Select different source and target sections.'},{status:400});
  const result=await prisma.$transaction(async tx=>{
   const target=await tx.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT s."id",s."gradeId",s."name" AS "sectionName",g."name" AS "gradeName",g."sessionId",ss."name" AS "sessionName",s."capacity" FROM "AcademicSection" s JOIN "AcademicGrade" g ON g.id=s."gradeId" JOIN "AcademicSession" ss ON ss.id=g."sessionId" WHERE s.id=$1 AND s."active"=true AND g."active"=true`,targetSectionId);
   if(!target[0])throw new Error('Target section not found or inactive.');
   const source=await tx.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT s."id",s."gradeId",s."name" AS "sectionName",g."name" AS "gradeName",g."sessionId",ss."name" AS "sessionName",e."id" AS "enrollmentId",e."className",e."section",e."admissionNumber",a."studentName" FROM "AcademicSection" s JOIN "AcademicGrade" g ON g.id=s."gradeId" JOIN "AcademicSession" ss ON ss.id=g."sessionId" JOIN "Enrollment" e ON e."academicSectionId"=s.id JOIN "Application" a ON a.id=e."applicationId" WHERE s.id=$1 AND s."active"=true AND g."active"=true AND e."academicSessionId"=g."sessionId" AND lower(e."status") IN ('active','enrolled') ORDER BY a."studentName"`,sourceSectionId);
   if(!source.length)return {count:0,id:null};
   const t=target[0];
   await tx.$queryRawUnsafe(`SELECT "id" FROM "AcademicSection" WHERE "id"=$1 FOR UPDATE`,targetSectionId);
   const occupancyRows=await tx.$queryRawUnsafe<Array<{count:bigint}>>(`SELECT COUNT(*)::bigint AS count FROM "Enrollment" WHERE "academicSectionId"=$1 AND lower("status") IN ('active','enrolled')`,targetSectionId);
   const occupancy=Number(occupancyRows[0]?.count||0);
   if(t.capacity!==null&&t.capacity!==undefined&&occupancy+source.length>Number(t.capacity))throw new Error(`Target section has capacity ${t.capacity}; ${occupancy} places are currently occupied and ${source.length} students are selected.`);
   const batchId=randomUUID();
   await tx.$executeRawUnsafe(`INSERT INTO "BatchPromotion" ("id","sourceSessionId","sourceGradeId","sourceSectionId","targetSessionId","targetGradeId","targetSectionId","studentCount","status","note","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPLETED',$9,$10)`,batchId,source[0].sessionId,source[0].gradeId,sourceSectionId,t.sessionId,t.gradeId,targetSectionId,source.length,note||null,user.id);
   for(const s of source){
    await tx.$executeRawUnsafe(`INSERT INTO "BatchPromotionStudent" ("id","batchPromotionId","enrollmentId","grNumber","studentName","fromClassName","fromSection","toClassName","toSection") SELECT $1,$2,$3,COALESCE(sr."grNumber",e."admissionNumber"),$4,$5,$6,$7,$8 FROM "Enrollment" e LEFT JOIN "StudentRegistry" sr ON sr."enrollmentId"=e.id WHERE e.id=$3`,randomUUID(),batchId,s.enrollmentId,s.studentName,s.className,s.section,t.gradeName,t.sectionName);
    await tx.$executeRawUnsafe(`INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","note","createdBy") VALUES ($1,$2,'BATCH_PROMOTED',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,randomUUID(),s.enrollmentId,source[0].sessionId,source[0].sessionName,source[0].gradeId,source[0].gradeName,sourceSectionId,source[0].sectionName,s.className,s.section,s.status,note||null,user.id);
    await tx.$executeRawUnsafe(`UPDATE "Enrollment" SET "academicSessionId"=$1,"academicGradeId"=$2,"academicSectionId"=$3,"className"=$4,"section"=$5,"status"='ACTIVE' WHERE "id"=$6`,t.sessionId,t.gradeId,targetSectionId,t.gradeName,t.sectionName,s.enrollmentId);
    await tx.$executeRawUnsafe(`INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","note","createdBy") VALUES ($1,$2,'PROMOTE',$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12)`,randomUUID(),s.enrollmentId,t.sessionId,t.sessionName,t.gradeId,t.gradeName,targetSectionId,t.sectionName,t.gradeName,t.sectionName,note||null,user.id);
   }
   return {count:source.length,id:batchId};
  });
  await writeAuditLog({userId:user.id,action:'BATCH_PROMOTION_COMPLETED',entityType:'BatchPromotion',entityId:result.id||'none',metadata:{sourceSectionId,targetSectionId,studentCount:result.count}});
  return NextResponse.json(result,{status:201});
 }catch(e){console.error(e);return NextResponse.json({error:e instanceof Error?e.message:'Unable to complete batch promotion.'},{status:400})}
}