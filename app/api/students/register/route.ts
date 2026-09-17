import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateGrNumber, getCustomFieldDefinitions, saveCustomValues } from "@/lib/student-registry";
import type { Gender, UserRole } from "@prisma/client";

const REGISTRATION_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];
function validGender(value: unknown): Gender | null { return typeof value === "string" && ["MALE", "FEMALE", "OTHER"].includes(value) ? value as Gender : null; }
function conditionMatches(condition: { field?: string; equals?: unknown } | null, values: Record<string, unknown>) { if (!condition?.field) return true; return values[condition.field] === condition.equals; }

export async function GET() {
  const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401}); if(!roleAllowed(user.role,REGISTRATION_ROLES))return NextResponse.json({error:"You do not have permission to access registration fields."},{status:403});
  try { const fields=await getCustomFieldDefinitions(true); return NextResponse.json(fields.filter(field=>field.visibilityRoles.includes(user.role))); } catch(error){console.error(error);return NextResponse.json({error:"Unable to load registration fields"},{status:500});}
}

export async function POST(request:NextRequest) {
  const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401}); if(!roleAllowed(user.role,REGISTRATION_ROLES))return NextResponse.json({error:"You do not have permission to register students."},{status:403});
  try {
    const body=await request.json() as Record<string,unknown>; const name=typeof body.studentName==="string"?body.studentName.trim():""; const guardianName=typeof body.guardianName==="string"?body.guardianName.trim():""; const guardianPhone=typeof body.guardianPhone==="string"?body.guardianPhone.trim():"";
    const sessionId=typeof body.sessionId==="string"?body.sessionId.trim():""; const gradeId=typeof body.gradeId==="string"?body.gradeId.trim():""; const sectionId=typeof body.sectionId==="string"?body.sectionId.trim():"";
    if(!name||!guardianName||!guardianPhone||!sessionId||!gradeId||!sectionId)return NextResponse.json({error:"Student name, guardian name, guardian phone, academic year, grade and section are required."},{status:400});
    const dateOfBirth=typeof body.dateOfBirth==="string"&&body.dateOfBirth?new Date(body.dateOfBirth):null; if(dateOfBirth&&Number.isNaN(dateOfBirth.getTime()))return NextResponse.json({error:"Invalid date of birth."},{status:400});
    const gender=validGender(body.gender); if(body.gender&&!gender)return NextResponse.json({error:"Invalid gender."},{status:400});
    const customFields=body.customFields&&typeof body.customFields==="object"&&!Array.isArray(body.customFields)?body.customFields as Record<string,unknown>:{};
    const definitions=(await getCustomFieldDefinitions(true)).filter(field=>field.visibilityRoles.includes(user.role)); for(const field of definitions){if(!field.required||!conditionMatches(field.condition,customFields))continue;const value=customFields[field.key];if(value===undefined||value===null||value===""||(Array.isArray(value)&&value.length===0))return NextResponse.json({error:`${field.label} is required.`},{status:400});}
    const context=requestAuditContext(request);
    const result=await prisma.$transaction(async tx=>{
      const structure=await tx.$queryRawUnsafe<{sessionId:string;sessionName:string;gradeId:string;gradeName:string;gradeCode:string;sectionId:string;sectionName:string;capacity:number|null;enrolledCount:bigint}[]>(`SELECT g."sessionId",s."name" AS "sessionName",g."id" AS "gradeId",g."name" AS "gradeName",g."code" AS "gradeCode",sec."id" AS "sectionId",sec."name" AS "sectionName",sec."capacity",(SELECT COUNT(*) FROM "Enrollment" e WHERE e."academicSectionId"=sec."id" AND lower(e."status") IN ('active','enrolled')) AS "enrolledCount" FROM "AcademicGrade" g JOIN "AcademicSession" s ON s."id"=g."sessionId" JOIN "AcademicSection" sec ON sec."gradeId"=g."id" WHERE s."id"=$1 AND g."id"=$2 AND sec."id"=$3 AND g."active"=true AND sec."active"=true LIMIT 1`,sessionId,gradeId,sectionId);
      if(!structure[0])throw new Error("Invalid academic structure selection."); const selected=structure[0]; if(selected.capacity!==null&&Number(selected.enrolledCount)>=selected.capacity)throw new Error("The selected section is at capacity.");
      const count=await tx.application.count(); const application=await tx.application.create({data:{applicationNumber:`REG-${String(count+1).padStart(5,"0")}`,sessionId,desiredClass:selected.gradeName,studentName:name,dateOfBirth,gender,guardianName,guardianPhone,guardianEmail:typeof body.guardianEmail==="string"?body.guardianEmail.trim()||null:null,previousSchool:typeof body.previousSchool==="string"?body.previousSchool.trim()||null:null,status:"ENROLLED"}});
      const enrollment=await tx.enrollment.create({data:{applicationId:application.id,studentId:`STU-${crypto.randomUUID().slice(0,8).toUpperCase()}`,admissionNumber:`ADM-${String(count+1).padStart(5,"0")}`,className:selected.gradeName,section:selected.sectionName}});
      await tx.$executeRawUnsafe(`UPDATE "Enrollment" SET "academicSessionId"=$1,"academicGradeId"=$2,"academicSectionId"=$3,"status"='ACTIVE' WHERE "id"=$4`,selected.sessionId,selected.gradeId,selected.sectionId,enrollment.id);
      const grNumber=await generateGrNumber(tx); const registry=await tx.$queryRawUnsafe<{id:string}[]>(`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES ($1,$2,$3) RETURNING "id"`,crypto.randomUUID(),enrollment.id,grNumber); await saveCustomValues(tx,registry[0].id,customFields,user.role); return {application,enrollment,grNumber};
    });
    await writeAuditLog({userId:user.id,action:"STUDENT_REGISTERED",entityType:"Application",entityId:result.application.id,metadata:{studentId:result.enrollment.studentId,grNumber:result.grNumber,className:result.enrollment.className,section:result.enrollment.section},context});
    return NextResponse.json({ok:true,id:result.application.id,studentId:result.enrollment.studentId,grNumber:result.grNumber,name:result.application.studentName,className:result.enrollment.className,section:result.enrollment.section},{status:201});
  } catch(error){console.error(error);const message=error instanceof Error?error.message:"";if(message==="Invalid academic structure selection."||message==="The selected section is at capacity.")return NextResponse.json({error:message},{status:400});return NextResponse.json({error:"Unable to register student. Check database migrations and required fields."},{status:500});}
}
