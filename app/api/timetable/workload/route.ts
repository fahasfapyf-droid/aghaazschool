import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "TEACHER"];
export async function GET(){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!roleAllowed(user.role,ROLES))return NextResponse.json({error:"You do not have permission to view teacher workload."},{status:403});
  const rows=await prisma.$queryRawUnsafe<Array<{id:string;employeeNumber:string;name:string;periods:string;minutes:string;classes:string;subjects:string}>>(`
    SELECT st."id",st."employeeNumber",st."name",
      COUNT(t."id")::text AS "periods",
      COALESCE(SUM((split_part(t."endTime",':',1)::int*60+split_part(t."endTime",':',2)::int)-(split_part(t."startTime",':',1)::int*60+split_part(t."startTime",':',2)::int)),0)::text AS "minutes",
      COUNT(DISTINCT t."academicSectionId")::text AS "classes",
      COUNT(DISTINCT t."academicSubjectId")::text AS "subjects"
    FROM "Staff" st
    LEFT JOIN "TimetableEntry" t ON t."teacherStaffId"=st."id"
    WHERE st."staffType"='TEACHER' AND st."active"=true
    GROUP BY st."id",st."employeeNumber",st."name"
    ORDER BY COUNT(t."id") DESC,st."name"`);
  return NextResponse.json(rows.map(r=>({...r,periods:Number(r.periods),minutes:Number(r.minutes),classes:Number(r.classes),subjects:Number(r.subjects)})));
}
