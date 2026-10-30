using System;
using System.Diagnostics;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

/// <summary>
/// 双环取色 · 双击启动器
/// 1) 端口已在监听 → 直接开浏览器；
/// 2) 否则用 pythonw 静默起服务，等端口就绪后再开浏览器。
/// 注意：这里只用 TCP 探测，不走 HTTP —— 系统代理会让 HttpWebRequest 连不上 127.0.0.1。
/// </summary>
internal static class Launcher
{
    private const int Port = 8766;
    private static readonly string Url = "http://127.0.0.1:" + Port + "/";

    [STAThread]
    private static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;

        if (!IsPortOpen())
        {
            if (!StartServer(dir))
            {
                return;
            }
        }

        OpenBrowser();
    }

    /// <summary>300ms 内能否连上端口。</summary>
    private static bool IsPortOpen()
    {
        try
        {
            using (var client = new TcpClient())
            {
                IAsyncResult ar = client.BeginConnect("127.0.0.1", Port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(300))
                {
                    return false;
                }
                client.EndConnect(ar);
                return client.Connected;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool StartServer(string dir)
    {
        string[] exes = { "pythonw.exe", "python.exe" };
        bool started = false;

        foreach (string exe in exes)
        {
            try
            {
                var psi = new ProcessStartInfo(exe, "-m colorpick --no-open")
                {
                    WorkingDirectory = dir,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(psi);
                started = true;
                break;
            }
            catch
            {
                // 换下一个候选
            }
        }

        if (!started)
        {
            MessageBox.Show(
                "找不到 Python。\n\n" +
                "办法一：双击“双环取色.html”，不需要 Python。\n" +
                "办法二：安装 Python 3.12 并勾选 Add to PATH，再双击本程序。",
                "双环取色", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }

        for (int i = 0; i < 80; i++)
        {
            Thread.Sleep(125);
            if (IsPortOpen())
            {
                return true;
            }
        }

        MessageBox.Show(
            "服务没能在 10 秒内就绪。\n\n" +
            "请双击“启动取色.bat”查看具体报错。",
            "双环取色", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return false;
    }

    private static void OpenBrowser()
    {
        try
        {
            // cmd start：立即返回，不会阻塞本进程
            Process.Start(new ProcessStartInfo("cmd.exe", "/c start \"\" \"" + Url + "\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show("浏览器打不开，请手动访问：\n" + Url + "\n\n" + ex.Message,
                "双环取色", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}
