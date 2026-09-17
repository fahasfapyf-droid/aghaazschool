import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const canWrite = new Set(["SUPER_ADMIN", "ADMIN"]);
const inputSchema = z.discriminatedUnion("entity", [
  z.object({ entity:z.literal("term"), sessionId:z.string().min(1), name:z.string().min(1).max(80), termKey:z.string().min(1).max(30), startDate:z.string().date(), endDate:z.string().date() }),
  z.object({ entity:z.literal("grade"), sessionId:z.string().min(1), name:z.string().min(1).max(80), code:z.string().min(1).max(30), displayOrder:z.number().int().min(0).default(0) }),
  z.object({ entity:z.literal("section"), gradeId:z.string().min(1), name:z.string().min(1).max(40), capacity:z.number().int().positive().optional(), classTeacherStaffId:z.string().min(1).optional() }),
  z.object({ entity:z.literal("subject"), code:z.string().min(1).max(30), name:z.string().min(1).max(100), shortName:z.string().max(30).optional() }),
  z.object({ entity:z.literal("classSubject"), gradeId:z.string().min(1), subjectId:z.string().min(1), termId:z.string().min(1).optional(), teacherStaffId:z.string().min(1).optional(), maxMarks:z.number().positive().optional(), displayOrder:z.number().int().min(0).default(0) }),
  z.object({ entity:z.literal("classTeacher"), sectionId:z.string().min(1), staffId:z.string().min(1), startDate:z.string().date().optional(), endDate:z.string().date().optional() }),
]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({error:"Authentication required."},{status:401});
    const sessions = await prisma.academicSession.findMany({orderBy:{startDate:"desc"},select:{id:true,name:true,startDate:true,endDate:true}});
    const [terms,grades,sections,subjects,classSubjects,classTeachers,staff] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT "id","sessionId","name","termKey","startDate","endDate","status" FROM "AcademicTermRecord" ORDER BY "startDate"`),
      prisma.$queryRawUnsafe(`SELECT "id","sessionId","name","code","displayOrder","active" FROM "AcademicGrade" ORDER BY "displayOrder","name"`),
      prisma.$queryRawUnsafe(`SELECT s."id",s."gradeId",s."name",s."capacity",s."classTeacherStaffId",s."active",g."name" AS "gradeName",st."name" AS "classTeacherName" FROM "AcademicSection" s JOIN "AcademicGrade" g ON g."id"=s."gradeId" LEFT JOIN "Staff" st ON st."id"=s."classTeacherStaffId" ORDER BY g."displayOrder",s."name"`),
      prisma.$queryRawUnsafe(`SELECT "id","code","name","shortName","active" FROM "AcademicSubject" ORDER BY "name"`),
      prisma.$queryRawUnsafe(`SELECT cs."id",cs."gradeId",cs."subjectId",cs."termId",cs."teacherStaffId",cs."maxMarks",cs."displayOrder",cs."active",g."name" AS "gradeName",s."name" AS "subjectName",t."name" AS "termName",st."name" AS "teacherName" FROM "AcademicClassSubject" cs JOIN "AcademicGrade" g ON g."id"=cs."gradeId" JOIN "AcademicSubject" s ON s."id"=cs."subjectId" LEFT JOIN "AcademicTermRecord" t ON t."id"=cs."termId" LEFT JOIN "Staff" st ON st."id"=cs."teacherStaffId" ORDER BY g."displayOrder",cs."displayOrder",s."name"`),
      prisma.$queryRawUnsafe(`SELECT ct."id",ct."sectionId",ct."staffId",ct."startDate",ct."endDate",ct."active",s."name" AS "sectionName",g."name" AS "gradeName",st."name" AS "staffName" FROM "AcademicClassTeacher" ct JOIN "AcademicSection" s ON s."id"=ct."sectionId" JOIN "AcademicGrade" g ON g."id"=s."gradeId" JOIN "Staff" st ON st."id"=ct."staffId" WHERE ct."active"=true ORDER BY g."displayOrder",s."name"`),
      prisma.staff.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,employeeNumber:true,name:true,designation:true}})
    ]);
    return NextResponse.json({sessions,terms,grades,sections,subjects,classSubjects,classTeachers,staff});
  } catch(error) { console.error(error); return NextResponse.json({error:"Unable to load academic structure. Apply the latest database migration."},{status:500}); }
}

export async function POST(request:NextRequest) {
  try {
    const user=await getCurrentUser();
    if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
    if(!canWrite.has(user.role)) return NextResponse.json({error:"You do not have permission to change academic structure."},{status:403});
    const input=inputSchema.parse(await request.json()); const id=randomUUID();
    if(input.entity==="term") await prisma.$executeRawUnsafe(`INSERT INTO "AcademicTermRecord" ("id","sessionId","name","termKey","startDate","endDate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,id,input.sessionId,input.name,input.termKey,input.startDate,input.endDate);
    else if(input.entity==="grade") await prisma.$executeRawUnsafe(`INSERT INTO "AcademicGrade" ("id","sessionId","name","code","displayOrder","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,id,input.sessionId,input.name,input.code,input.displayOrder);
    else if(input.entity==="section") await prisma.$executeRawUnsafe(`INSERT INTO "AcademicSection" ("id","gradeId","name","capacity","classTeacherStaffId","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,id,input.gradeId,input.name,input.capacity??null,input.classTeacherStaffId??null);
    else if(input.entity==="subject") await prisma.$executeRawUnsafe(`INSERT INTO "AcademicSubject" ("id","code","name","shortName","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,id,input.code,input.name,input.shortName??null);
    else if(input.entity==="classSubject") await prisma.$executeRawUnsafe(`INSERT INTO "AcademicClassSubject" ("id","gradeId","subjectId","termId","teacherStaffId","maxMarks","displayOrder","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,id,input.gradeId,input.subjectId,input.termId??null,input.teacherStaffId??null,input.maxMarks??null,input.displayOrder);
    else await prisma.$executeRawUnsafe(`INSERT INTO "AcademicClassTeacher" ("id","sectionId","staffId","startDate","endDate","updatedAt") VALUES ($1,$2,$3,COALESCE($4::date,CURRENT_DATE),$5,CURRENT_TIMESTAMP)`,id,input.sectionId,input.staffId,input.startDate??null,input.endDate??null);
    await prisma.auditLog.create({data:{userId:user.id,action:"ACADEMIC_STRUCTURE_CREATED",entityType:input.entity,entityId:id,metadata:input}});
    return NextResponse.json({id},{status:201});
  } catch(error) {
    if(error instanceof z.ZodError) return NextResponse.json({error:"Invalid academic structure data.",details:error.flatten()},{status:400});
    console.error(error); return NextResponse.json({error:"Unable to save academic structure. Check uniqueness and referenced records."},{status:400});
  }
}
