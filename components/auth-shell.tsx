"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { AnalyticsApp, type Department, type ImportedRow, type Profile, type Upload } from "@/components/analytics-app-v2";

type HubProfile = {
  id:string; full_name:string; email:string; department:string|null; role:string;
  status:string; job_title:string|null; analytics_enabled?:boolean; analytics_role?:string;
};

export function AuthShell(){
  const [session,setSession]=useState<Session|null>(null);
  const [checking,setChecking]=useState(true);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [error,setError]=useState("");
  const [recovery,setRecovery]=useState(false);

  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);setChecking(false);}});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{
      if(!mounted)return;
      if(event==="PASSWORD_RECOVERY")setRecovery(true);
      setSession(next);setChecking(false);
      if(!next){setProfile(null);setProfiles([]);}
    });
    return()=>{mounted=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!session)return;
    let active=true;
    async function load(){
      setChecking(true);setError("");
      const {data,currentError}=await loadCurrentProfile(session!.user.id);
      if(!active)return;
      if(currentError||!data){setError(currentError||"Tu cuenta no tiene un perfil de CC HUB.");setChecking(false);return;}
      try{
        const mapped=mapProfile(data);
        if(!mapped.active)throw new Error("Tu acceso a CC ANALYTICS está inactivo o pendiente de aprobación. Contacta al administrador.");
        setProfile(mapped);
        if(mapped.role==="Administrador"){
          const {data:all}=await supabase.from("profiles").select("id,full_name,email,department,role,status,job_title").order("full_name");
          const {data:analytics}=await supabase.from("profiles").select("id,analytics_enabled,analytics_role");
          const access=new Map((analytics||[]).map(row=>[row.id,row]));
          setProfiles((all||[]).flatMap(row=>{try{return[mapProfile({...row,...access.get(row.id)} as HubProfile)];}catch{return[];}}));
        }else setProfiles([mapped]);
      }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el perfil.");}
      finally{if(active)setChecking(false);}
    }
    void load();return()=>{active=false;};
  },[session]);

  if(checking)return <LoadingScreen/>;
  if(recovery&&session)return <RecoveryScreen onDone={()=>setRecovery(false)}/>;
  if(!session)return <LoginScreen/>;
  if(error)return <AccessError message={error} onExit={()=>void supabase.auth.signOut()}/>;
  if(!profile)return <LoadingScreen/>;
  const currentProfile=profile;
  async function updateAccess(updated:Profile){
    const analyticsRole=updated.role==="Administrador"?"admin":updated.role==="Gerente"?"manager":updated.role==="Operador"?"uploader":"analyst";
    const {error}=await supabase.rpc("admin_set_user_access",{
      target_user_id:updated.id,target_department:updated.department,target_analytics_enabled:updated.active,
      target_analytics_role:analyticsRole,
    });
    return error?.message||null;
  }
  async function updateOwnProfile(name:string){
    const {error}=await supabase.from("profiles").update({full_name:name}).eq("id",currentProfile.id);
    if(error)throw error;
    const updated:Profile={...currentProfile,name,initials:name.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()};
    setProfile(updated);setProfiles(current=>current.map(row=>row.id===updated.id?updated:row));
    return updated;
  }
  async function importData(upload:Upload,rows:ImportedRow[]){
    const {data:created,error:importError}=await supabase.from("analytics_imports").insert({
      file_name:upload.file,department:upload.department,module:"general",row_count:rows.length,uploaded_by:currentProfile.id,
    }).select("id").single();
    if(importError||!created)return importError?.message||"No se pudo crear el registro de importación.";
    for(let start=0;start<rows.length;start+=500){
      const batch=rows.slice(start,start+500).map(payload=>({
        import_id:created.id,department:upload.department,module:"general",payload,created_by:currentProfile.id,
      }));
      const {error}=await supabase.from("analytics_records").insert(batch);
      if(error)return `La carga quedó incompleta: ${error.message}`;
    }
    return null;
  }
  return <AnalyticsApp initialProfile={profile} initialProfiles={profiles} onSignOut={()=>void supabase.auth.signOut()} onUpdateAccess={updateAccess} onUpdateProfile={updateOwnProfile} onImportData={importData}/>;
}

async function loadCurrentProfile(id:string){
  const {data,error}=await supabase.from("profiles").select("id,full_name,email,department,role,status,job_title").eq("id",id).single();
  if(error||!data)return {data:null,currentError:error?.message||"Perfil no encontrado."};
  const {data:analytics}=await supabase.from("profiles").select("analytics_enabled,analytics_role").eq("id",id).maybeSingle();
  return {data:{...data,...(analytics||{})} as HubProfile,currentError:""};
}

function mapProfile(row:HubProfile):Profile{
  const role=row.analytics_role==="admin"?"Administrador":row.analytics_role==="manager"?"Gerente":row.analytics_role==="uploader"?"Operador":row.analytics_role?"Analista":row.role==="administrador"?"Administrador":row.role==="supervisor"?"Gerente":"Analista";
  const department=normalizeDepartment(row.department,role);
  const name=row.full_name?.trim()||row.email;
  const initials=name.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();
  return {id:row.id,name,email:row.email,department,role,initials,active:row.status==="activo"&&row.analytics_enabled!==false};
}

function normalizeDepartment(value:string|null,role:Profile["role"]):Department{
  if(role==="Administrador")return "Administración";
  const key=(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const map:Record<string,Department>={
    "ventas digitales":"Ventas Digitales","ventas residencial":"Ventas Residenciales","ventas residenciales":"Ventas Residenciales",
    "ventas corporativas":"Ventas Corporativas","marketing":"Marketing","marketing digital":"Marketing",
    "call center":"Call Center","telemercadeo":"Call Center","recursos humanos":"Recursos Humanos","rrhh":"Recursos Humanos",
    "finanzas":"Finanzas","operaciones":"Operaciones","instalaciones":"Operaciones","soporte tecnico":"Operaciones","inventario":"Operaciones",
  };
  const found=map[key];
  if(!found)throw new Error(`Tu departamento (${value||"sin asignar"}) todavía no está configurado para CC ANALYTICS.`);
  return found;
}

function LoginScreen(){
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
  async function login(e:React.FormEvent){e.preventDefault();setLoading(true);setError("");setMessage("");const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)setError(error.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":error.message);setLoading(false);}
  async function reset(){if(!email.trim()){setError("Escribe primero tu correo corporativo.");return;}setLoading(true);setError("");const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin});if(error)setError(error.message);else setMessage("Te enviamos un enlace para restablecer tu contraseña.");setLoading(false);}
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#070709] p-5 text-white"><div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-purple-700/20 blur-[120px]"/><div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-fuchsia-700/15 blur-[120px]"/><div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/[.08] bg-[#0d0d12]/95 shadow-2xl lg:grid-cols-[1.05fr_.95fr]"><section className="hidden min-h-[620px] flex-col justify-between border-r border-white/[.06] bg-gradient-to-br from-purple-950/40 via-[#101016] to-[#0b0b0f] p-12 lg:flex"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-lg font-black text-purple-300">CC</div><div><p className="font-black tracking-[.18em]">CC ANALYTICS</p><p className="text-[10px] uppercase tracking-[.28em] text-purple-300/60">Cable Color Honduras</p></div></div><div><span className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1.5 text-[10px] font-bold text-purple-300"><ShieldCheck size={13}/> ACCESO EMPRESARIAL</span><h1 className="mt-6 max-w-md text-4xl font-black leading-tight">Toda la inteligencia de Cable Color en un solo lugar.</h1><p className="mt-5 max-w-md text-sm leading-7 text-zinc-400">Utiliza la misma cuenta de CC HUB. Tus módulos, datos y permisos se cargan automáticamente según tu perfil.</p><div className="mt-8 grid gap-3">{["Una sola cuenta para CC HUB y Analytics","Información protegida por departamento","Administrador con visibilidad global"].map(x=><div key={x} className="flex items-center gap-3 text-xs text-zinc-300"><CheckCircle2 size={16} className="text-emerald-400"/>{x}</div>)}</div></div><p className="text-[10px] text-zinc-600">Plataforma corporativa · Acceso autorizado exclusivamente</p></section><section className="flex min-h-[620px] flex-col justify-center p-7 sm:p-12"><div className="mb-8 lg:hidden"><div className="text-lg font-black tracking-[.18em]">CC ANALYTICS</div><div className="text-[9px] uppercase tracking-[.25em] text-purple-400">Business Intelligence</div></div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">Bienvenido</p><h2 className="mt-2 text-2xl font-black">Iniciar sesión</h2><p className="mt-2 text-xs text-zinc-500">Ingresa con las credenciales que utilizas en CC HUB.</p><form onSubmit={login} className="mt-8 space-y-4"><label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">Correo corporativo<div className="mt-2 flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.025] px-3 focus-within:border-purple-400/50"><Mail size={16} className="text-zinc-600"/><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="nombre@cablecolor.hn" className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-zinc-700"/></div></label><label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">Contraseña<div className="mt-2 flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.025] px-3 focus-within:border-purple-400/50"><LockKeyhole size={16} className="text-zinc-600"/><input value={password} onChange={e=>setPassword(e.target.value)} type={show?"text":"password"} required autoComplete="current-password" className="w-full bg-transparent py-3.5 text-sm outline-none"/><button type="button" aria-label={show?"Ocultar contraseña":"Mostrar contraseña"} onClick={()=>setShow(!show)} className="text-zinc-600">{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>{error&&<p className="rounded-xl border border-rose-500/15 bg-rose-500/[.06] p-3 text-xs text-rose-300">{error}</p>}{message&&<p className="rounded-xl border border-emerald-500/15 bg-emerald-500/[.06] p-3 text-xs text-emerald-300">{message}</p>}<button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 p-3.5 text-xs font-black shadow-[0_0_30px_rgba(168,85,247,.2)] disabled:opacity-50">{loading?"Verificando...":"Ingresar a CC ANALYTICS"}<ArrowRight size={16}/></button></form><button onClick={reset} disabled={loading} className="mt-5 text-xs font-semibold text-purple-300 hover:text-purple-200">¿Olvidaste tu contraseña?</button><div className="mt-8 border-t border-white/[.06] pt-6 text-center text-[10px] leading-5 text-zinc-600">Tu acceso y departamento son administrados desde CC HUB.</div></section></div></main>;
}

function RecoveryScreen({onDone}:{onDone:()=>void}){const [password,setPassword]=useState("");const [message,setMessage]=useState("");async function save(e:React.FormEvent){e.preventDefault();const {error}=await supabase.auth.updateUser({password});setMessage(error?error.message:"Contraseña actualizada correctamente.");if(!error)setTimeout(onDone,1200);}return <main className="grid min-h-screen place-items-center bg-[#070709] p-5 text-white"><form onSubmit={save} className="glass w-full max-w-md rounded-3xl p-8"><h1 className="text-xl font-black">Crear nueva contraseña</h1><p className="mt-2 text-xs text-zinc-500">Utiliza al menos 8 caracteres.</p><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={8} required className="mt-6 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm outline-none focus:border-purple-400/50"/><button className="mt-4 w-full rounded-xl bg-purple-600 p-3 text-xs font-bold">Actualizar contraseña</button>{message&&<p className="mt-4 text-xs text-emerald-400">{message}</p>}</form></main>}
function LoadingScreen(){return <main className="grid min-h-screen place-items-center bg-[#070709] text-white"><div className="text-center"><div className="mx-auto grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-purple-500/10 font-black text-purple-300">CC</div><p className="mt-4 text-xs font-bold uppercase tracking-[.2em] text-zinc-500">Cargando tu perfil...</p></div></main>}
function AccessError({message,onExit}:{message:string;onExit:()=>void}){return <main className="grid min-h-screen place-items-center bg-[#070709] p-5 text-white"><div className="glass w-full max-w-md rounded-3xl p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-400"><LockKeyhole/></div><h1 className="mt-5 text-xl font-black">Acceso pendiente</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p><button onClick={onExit} className="mt-6 rounded-xl border border-white/10 px-5 py-3 text-xs font-bold">Cerrar sesión</button></div></main>}
