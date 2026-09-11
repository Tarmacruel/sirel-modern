// Embedded so tsc builds ship the supervisor without a separate asset-copy step.
// Windows 10+: atomic job assignment prevents even a launcher crash from leaving
// an unowned soffice.bin. The job handle is never inherited by its children.
export const windowsOfficeSupervisor = String.raw`
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
public static class SirelOfficeJob {
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit {
    public long a,b; public uint flags; public UIntPtr min,max;
    public uint count; public UIntPtr affinity; public uint priority,scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Limits {
    public BasicLimit basic; public IO io; public UIntPtr a,b,c,d;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long a,b,c,d; public uint faults,total,active,terminated;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
    public int cb; public string reserved,desktop,title;
    public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
    public ushort show,reservedSize; public IntPtr reserved2,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup startup; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a, string b);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j,int c,ref Limits l,int n);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr j,int c,out Accounting a,int n,IntPtr r);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr p,int c,int f,ref IntPtr n);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr p,uint f,IntPtr a,IntPtr v,IntPtr n,IntPtr x,IntPtr y);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr p);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref StartupEx si,out ProcessInfo pi);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr j,uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr p,out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr p);
  static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static uint Active(IntPtr job) {
    Accounting a; Check(QueryInformationJobObject(job,1,out a,Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero)); return a.active;
  }
  public static int Run(string app,string command,int owner) {
    IntPtr job=IntPtr.Zero, attrs=IntPtr.Zero, value=IntPtr.Zero;
    ProcessInfo pi=new ProcessInfo(); bool initialized=false;
    // Opening the handle now also protects against PID reuse after Node exits.
    using(Process parent=Process.GetProcessById(owner)) {
      IntPtr parentHandle=parent.Handle;
      Task<string> cancel=Task.Run(() => Console.In.ReadLine());
      try {
        job=CreateJobObject(IntPtr.Zero,null); Check(job!=IntPtr.Zero);
        Limits limits=new Limits(); limits.basic.flags=0x2000;
        Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(Limits))));
        IntPtr size=IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        attrs=Marshal.AllocHGlobal(size);
        Check(InitializeProcThreadAttributeList(attrs,1,0,ref size)); initialized=true;
        value=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(value,job);
        Check(UpdateProcThreadAttribute(attrs,0,new IntPtr(0x2000D),value,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
        StartupEx si=new StartupEx(); si.startup.cb=Marshal.SizeOf(typeof(StartupEx)); si.attributes=attrs;
        // EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, no shell, no handles inherited.
        Check(CreateProcessW(app,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x08080000,IntPtr.Zero,null,ref si,out pi));
        Console.WriteLine("{\"pid\":"+pi.pid+"}"); Console.Out.Flush();
        bool stopped=false;
        while(Active(job)>0) {
          if(!stopped && (parent.HasExited || cancel.IsCompleted)) {
            Check(TerminateJobObject(job,124)); stopped=true;
          }
          Thread.Sleep(50);
        }
        uint code; Check(GetExitCodeProcess(pi.process,out code));
        return stopped ? 124 : (int)code;
      } finally {
        if(job!=IntPtr.Zero) {
          // Also runs on supervisor exceptions. Never release files before the tree exits.
          TerminateJobObject(job,125);
          var wait=Stopwatch.StartNew();
          while(Active(job)>0 && wait.ElapsedMilliseconds<5000) Thread.Sleep(50);
          CloseHandle(job);
        }
        if(pi.thread!=IntPtr.Zero) CloseHandle(pi.thread);
        if(pi.process!=IntPtr.Zero) CloseHandle(pi.process);
        if(initialized) DeleteProcThreadAttributeList(attrs);
        if(attrs!=IntPtr.Zero) Marshal.FreeHGlobal(attrs);
        if(value!=IntPtr.Zero) Marshal.FreeHGlobal(value);
      }
    }
  }
}
'@
$code = [SirelOfficeJob]::Run($env:SIREL_OFFICE_EXE, $env:SIREL_OFFICE_COMMAND, [int]$env:SIREL_OFFICE_OWNER)
exit $code
} catch { [Console]::Error.WriteLine('Office supervisor failed'); exit 125 }
`;

// CommandLineToArgvW/MS CRT quoting; document names never become PowerShell code.
export function quoteWindowsArgument(value: string) {
  return (
    '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1") + '"'
  );
}
