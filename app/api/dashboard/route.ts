import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(){
  try{
    const [admissions,students,attendance,paid,invoiceTotals,recentApplications,recentPayments,recentResults]=await Promise.all([
      prisma.application.count({where:{status:{notIn:["REJECTED","CANCELLED","WITHDRAWN"]}}}),
      prisma.enrollment.count({where:{status:"active"}}),
      prisma.attendance.findMany({where:{date:{gte:new Date(new Date().setHours(0,0,0,0)),lt:new Date(new Date().setHours(24,0,0,0))}},select:{status:true}}),
      prisma.feePayment.aggregate({where:{paidAt:{gte:new Date(new Date().getFullYear(),new Date().getMonth(),1)}},_sum:{amount:true}}),
      prisma.feeInvoice.aggregate({_sum:{netAmount:true}}),
      prisma.application.findMany({orderBy:{createdAt:"desc"},take:3,select:{applicationNumber:true,studentName:true,desiredClass:true,createdAt:true}}),
      prisma.feePayment.findMany({orderBy:{paidAt:"desc"},take:2,include:{invoice:{include:{student:{include:{application:true}}}}}),
      prisma.result.findMany({orderBy:{updatedAt:"desc"},take:2,include:{student:{include:{application:true}},paper:{include:{exam:true}}}})
    ]);
    const present=attendance.filter(x=>x.status==="PRESENT"||x.status==="LATE").length;
    return NextResponse.json({admissions,students,attendance:{total:attendance.length,present,percent:attendance.length?Number((present/attendance.length*100).toFixed(1)):0},fees:{collected:Number(paid._sum.amount||0),billed:Number(invoiceTotals._sum.netAmount||0)},recent:{applications:recentApplications,payments:recentPayments,results:recentResults}});
  }catch(error){console.error(error);return NextResponse.json({error:"Unable to load dashboard statistics"},{status:500})}
}
