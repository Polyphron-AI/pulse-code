// The helper receives data over stdin. Dictated text is never executed as code.
export const windowsVoiceSource = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
public static class PulseVoice {
  delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  static Hook callback = OnKey;
  static IntPtr hook;
  static readonly object gate = new object();
  static readonly bool[] pressed = new bool[256];
  static int[] chord = new int[0];
  static bool held;
  static int swallowed;
  static readonly Dictionary<string, Target> targets = new Dictionary<string, Target>();
  struct Target { public IntPtr Window, Focus; public string Control; }
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)] struct Gui { public uint Size, Flags; public IntPtr Active,Focus,Capture,Menu,Move,Caret; public Rect CaretRect; }
  [StructLayout(LayoutKind.Sequential)] struct Msg { public IntPtr Window; public uint Message; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Point; public uint Private; }
  [StructLayout(LayoutKind.Sequential)] struct Key { public ushort Vk,Scan; public uint Flags,Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public int X,Y; public uint Data,Flags,Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Key Key; [FieldOffset(0)] public Mouse Mouse; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public Union Data; }
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern int GetMessage(out Msg message,IntPtr window,uint min,uint max);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Msg message);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Msg message);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref Gui info);
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,Input[] inputs,int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  static void Emit(string value) { lock(gate) { Console.WriteLine(value); Console.Out.Flush(); } }
  static string Encode(string value) { return Convert.ToBase64String(Encoding.UTF8.GetBytes(value)); }
  static int Normalize(int key) { if(key==162||key==163)return 17; if(key==160||key==161)return 16; if(key==164||key==165)return 18; if(key==92)return 91; return key; }
  static bool Matches() {
    if(chord.Length==0)return false;
    foreach(int key in chord) if(!pressed[key])return false;
    foreach(int key in new int[]{16,17,18,91}) if(pressed[key]!=Array.Exists(chord,k=>k==key))return false;
    return true;
  }
  static IntPtr OnKey(int code,IntPtr message,IntPtr data) {
    if(code<0||(Marshal.ReadInt32(data,8)&16)!=0)return CallNextHookEx(hook,code,message,data);
    int key=Normalize(Marshal.ReadInt32(data));
    if(key<0||key>=256)return CallNextHookEx(hook,code,message,data);
    bool down=message.ToInt32()==256||message.ToInt32()==260;
    lock(gate) {
      pressed[key]=down; bool matches=Matches();
      if(down&&matches&&!held) {
        held=true; swallowed=key; IntPtr window=GetForegroundWindow();
        ThreadPool.QueueUserWorkItem(_=>Emit("toggle\t"+(GetForegroundWindow()==window?Capture():"")));
        return (IntPtr)1;
      }
      if(!matches)held=false;
      if(key==swallowed) { if(!down)swallowed=0; return (IntPtr)1; }
    }
    return CallNextHookEx(hook,code,message,data);
  }
  static Target Current() {
    IntPtr window=GetForegroundWindow(); uint process;
    uint thread=GetWindowThreadProcessId(window,out process);
    Gui info=new Gui(); info.Size=(uint)Marshal.SizeOf(typeof(Gui));
    if(window==IntPtr.Zero||!GetGUIThreadInfo(thread,ref info)||info.Focus==IntPtr.Zero)throw new Exception("No focused text target. Click a text field and try again.");
    AutomationElement element=AutomationElement.FocusedElement;
    if(element==null)throw new Exception("The focused text field is unavailable.");
    ControlType type=element.Current.ControlType;
    if(type!=ControlType.Edit&&type!=ControlType.Document&&type!=ControlType.ComboBox)throw new Exception("Click an accessible text field before dictating.");
    string control=string.Join(",",element.GetRuntimeId());
    if(control.Length==0)throw new Exception("The focused text field could not be identified.");
    return new Target { Window=window, Focus=info.Focus, Control=control };
  }
  static string Capture() {
    try { Target target=Current(); string token=Guid.NewGuid().ToString("N"); lock(gate) { if(targets.Count>16)targets.Clear(); targets[token]=target; } return token; }
    catch { return ""; }
  }
  static void Deliver(string token,string text) {
    Target target;
    lock(gate) { if(!targets.TryGetValue(token,out target))throw new Exception("Dictation target expired. Copy the transcript from Pulse Code."); targets.Clear(); }
    Target current=Current();
    if(current.Window!=target.Window||current.Focus!=target.Focus||current.Control!=target.Control)throw new Exception("Focus changed. Copy the transcript from Pulse Code to the intended field.");
    foreach(int key in new int[]{16,17,18,91,92})if((GetAsyncKeyState(key)&0x8000)!=0)throw new Exception("Release modifier keys before insertion. Copy the transcript from Pulse Code.");
    if(text.Length>20000)throw new Exception("Transcript is too long for direct insertion. Copy it from Pulse Code.");
    Input[] inputs=new Input[text.Length*2];
    for(int i=0;i<text.Length;i++) {
      inputs[i*2].Type=1; inputs[i*2].Data.Key.Scan=text[i]; inputs[i*2].Data.Key.Flags=4;
      inputs[i*2+1].Type=1; inputs[i*2+1].Data.Key.Scan=text[i]; inputs[i*2+1].Data.Key.Flags=6;
    }
    if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(Input)))!=inputs.Length)throw new Exception("Windows could not insert all text. Check the field before copying the transcript from Pulse Code.");
  }
  static void Commands() {
    string line;
    while((line=Console.ReadLine())!=null) {
      string[] parts=line.Split('\t'); string id=parts.Length>1?parts[1]:"0";
      try {
        if(parts[0]=="config") { lock(gate) { chord=parts[2].Length==0?new int[0]:Array.ConvertAll(parts[2].Split(','),int.Parse); Array.Clear(pressed,0,pressed.Length); held=false; targets.Clear(); } Emit("result\t"+id+"\t"); }
        else if(parts[0]=="capture") Emit("target\t"+id+"\t"+Capture());
        else if(parts[0]=="deliver") { Deliver(parts[2],Encoding.UTF8.GetString(Convert.FromBase64String(parts[3]))); Emit("result\t"+id+"\t"); }
      } catch(Exception error) { Emit("result\t"+id+"\t"+Encode(error.Message)); }
    }
    Environment.Exit(0);
  }
  public static string SelfTest() {
    if(Marshal.SizeOf(typeof(Input))!=(IntPtr.Size==8?40:28))throw new Exception("Invalid INPUT layout");
    chord=new int[]{17,91}; pressed[17]=true; pressed[91]=true;
    if(!Matches())throw new Exception("Modifier chord failed"); pressed[16]=true;
    if(Matches())throw new Exception("Extra modifiers should not match");
    return "Windows voice helper layout and shortcut checks passed";
  }
  public static void Run() {
    hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);
    if(hook==IntPtr.Zero)throw new Exception("Could not install Windows voice shortcut hook");
    new Thread(Commands) { IsBackground=true }.Start(); Emit("ready");
    try { Msg message; while(GetMessage(out message,IntPtr.Zero,0,0)>0) { TranslateMessage(ref message); DispatchMessage(ref message); } }
    finally { UnhookWindowsHookEx(hook); }
  }
}
`;
