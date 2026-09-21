import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const roles=["SUPER_ADMIN","ADMIN"] as const;
const bodySchema=z.object({source:z.enum(["enrollment","staff"]),rows:z.array(z.record(z.string(),z.string())).max(5000)});
const clean=(value:string|undefined)=>(value||"").trim();

export async function POST(request:NextRequest){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!roleAllowed(user.role,[...roles]))return NextResponse.json({error:"Administrator access required."},{status:403});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid staged import payload."},{status:400});
  const{source,rows}=parsed.data;
  const errors:Array<{row:number;error:string}>=[];

  if(source==="staff"){
    rows.forEach((row,index)=>{
      if(clean(row["Employee Name"]).length<2)errors.push({row:index+2,error:"Employee Name is required."});
      if(clean(row["Designation"]).length<2)errors.push({row:index+2,error:"Designation is required."});
      const salary=clean(row["Monthly Salary"]);
      if(salary&&Number.isNaN(Number(salary.replace(/,/g,""))))errors.push({row:index+2,error:"Monthly Salary must be numeric."});
    });
  }else{
    rows.forEach((row,index)=>{
      if(clean(row.GR).length<2)errors.push({row:index+2,error:"GR is required."});
      if(clean(row.Name).length<2)errors.push({row:index+2,error:"Name is required."});
      if(clean(row["D.O.B"])&&Number.isNaN(Date.parse(clean(row["D.O.B"]))))errors.push({row:index+2,error:"D.O.B is not a recognized date."});
    });
  }

  const invalidRows=new Set(errors.map(item=>item.row)).size;
  return NextResponse.json({source,totalRows:rows.length,validRows:rows.length-invalidRows,invalidRows,errors:errors.slice(0,100),written:false,message:"Validation only. No production records were created or modified."});
}
