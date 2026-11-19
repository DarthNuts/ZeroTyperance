// ZeroTyperance.exe - the native launcher of the Windows packages (portable zip and setup.exe).
//   ZeroTyperance.exe [--port N] [--no-open]   start (or only open the window of the one that runs on that port)
//   ZeroTyperance.exe --quit [--port N]        stop the one on that port; returns when it has stopped (<= 5 s)
// Runs node\node.exe launch.mjs hidden, in one job object (KILL_ON_JOB_CLOSE: the children never outlive this
// process), keeps a tray icon, opens an Edge / Chrome app window on http://localhost:N/.
// Wide-char Win32 only. Link: shell32 user32 advapi32 ws2_32.
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0601
#include <winsock2.h>
#include <windows.h>
#include <shellapi.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

#define DEFAULT_PORT 8802
#define PATHCAP 4096
#define CLASS_NAME L"ZeroTyperanceTray"

enum {
    WM_TRAY = WM_APP + 1,   // tray icon callback
    WM_SHOWREQ,             // another start asks for the window
    WM_W_ROMBALLOON,        // worker: fetching the ROM image
    WM_W_READY,             // worker: the server answers
    WM_W_EXITOK,            // worker: node exited 0 because one already ran: open the window, exit 0
    WM_W_FAIL,              // worker: could not start
    WM_W_NODEDIED           // worker: node died while running (wParam = exit code)
};
enum { ID_OPEN = 1, ID_QUIT = 2 };

static wchar_t g_dir[PATHCAP];      // the exe's own folder, no trailing backslash
static wchar_t g_logpath[PATHCAP];
static int g_port = DEFAULT_PORT;
static int g_open = 1;
static int g_test;                  // ZT_LAUNCHER_TEST=1: no MessageBox
static HINSTANCE g_inst;
static HANDLE g_log = INVALID_HANDLE_VALUE;
static HANDLE g_nul = INVALID_HANDLE_VALUE;
static HANDLE g_job;
static HANDLE g_quitEvt;
static HWND g_hwnd;
static CRITICAL_SECTION g_cs;
static volatile LONG g_quitting;
static volatile LONG g_ready;
static int g_wantOpen;
static int g_exit;
static NOTIFYICONDATAW g_nid;
static UINT g_msgTaskbar;
static wchar_t g_failWhy[256];

// ---------------------------------------------------------------- log
static void logw(const wchar_t *fmt, ...)
{
    wchar_t w[1500];
    char u[6200];
    va_list ap;
    va_start(ap, fmt);
    _vsnwprintf(w, 1499, fmt, ap);
    va_end(ap);
    w[1499] = 0;
    int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, u, (int)sizeof u - 4, NULL, NULL);
    if (n <= 0 || g_log == INVALID_HANDLE_VALUE) return;
    u[n - 1] = '\r';
    u[n] = '\n';
    DWORD wr;
    EnterCriticalSection(&g_cs);
    WriteFile(g_log, u, (DWORD)n + 1, &wr, NULL);
    LeaveCriticalSection(&g_cs);
}

static void open_log(void)
{
    SECURITY_ATTRIBUTES sa = { sizeof sa, NULL, TRUE };
    _snwprintf(g_logpath, PATHCAP - 1, L"%ls\\ZeroTyperance.log", g_dir);
    g_log = CreateFileW(g_logpath, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, CREATE_ALWAYS,
                        FILE_ATTRIBUTE_NORMAL, NULL);
    if (g_log == INVALID_HANDLE_VALUE) {
        wchar_t t[MAX_PATH + 2];
        DWORD n = GetTempPathW(MAX_PATH, t);
        if (n > 0 && n < MAX_PATH) {
            _snwprintf(g_logpath, PATHCAP - 1, L"%lsZeroTyperance.log", t);
            g_log = CreateFileW(g_logpath, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, CREATE_ALWAYS,
                                FILE_ATTRIBUTE_NORMAL, NULL);
        }
    }
    g_nul = CreateFileW(L"NUL", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING,
                        FILE_ATTRIBUTE_NORMAL, NULL);
    if (g_log == INVALID_HANDLE_VALUE) g_log = g_nul;
}

// The last lines of the log, for the failure box.
static void log_tail(wchar_t *out, int cap, int lines)
{
    out[0] = 0;
    HANDLE h = CreateFileW(g_logpath, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING,
                           FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return;
    LARGE_INTEGER sz;
    char buf[4096];
    DWORD got = 0;
    if (GetFileSizeEx(h, &sz)) {
        LARGE_INTEGER pos;
        pos.QuadPart = sz.QuadPart > (LONGLONG)sizeof buf ? sz.QuadPart - (LONGLONG)sizeof buf : 0;
        SetFilePointerEx(h, pos, NULL, FILE_BEGIN);
        ReadFile(h, buf, sizeof buf, &got, NULL);
    }
    CloseHandle(h);
    if (got == 0) return;
    wchar_t *w = (wchar_t *)HeapAlloc(GetProcessHeap(), 0, sizeof(wchar_t) * (got + 1));
    if (!w) return;
    int n = MultiByteToWideChar(CP_UTF8, 0, buf, (int)got, w, (int)got);
    if (n < 0) n = 0;
    w[n] = 0;
    int e = n;
    while (e > 0 && (w[e - 1] == L'\r' || w[e - 1] == L'\n')) e--;
    int start = e, seen = 0;
    while (start > 0) {
        if (w[start - 1] == L'\n' && ++seen >= lines) break;
        start--;
    }
    wchar_t *d = out;
    for (int i = start; i < e && d < out + cap - 1; i++)
        if (w[i] != L'\r') *d++ = w[i];
    *d = 0;
    HeapFree(GetProcessHeap(), 0, w);
}

// ---------------------------------------------------------------- small helpers
static int file_exists(const wchar_t *p)
{
    DWORD a = GetFileAttributesW(p);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static int probe_ours(int port)
{
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return 0;
    int ok = 0;
    u_long nb = 1;
    ioctlsocket(s, FIONBIO, &nb);
    struct sockaddr_in a;
    memset(&a, 0, sizeof a);
    a.sin_family = AF_INET;
    a.sin_port = htons((u_short)port);
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int r = connect(s, (struct sockaddr *)&a, sizeof a);
    if (r != 0) {
        if (WSAGetLastError() != WSAEWOULDBLOCK) goto done;
        fd_set wf, ef;
        FD_ZERO(&wf);
        FD_ZERO(&ef);
        FD_SET(s, &wf);
        FD_SET(s, &ef);
        struct timeval tv = { 1, 500000 };
        if (select(0, NULL, &wf, &ef, &tv) <= 0 || !FD_ISSET(s, &wf)) goto done;
    }
    nb = 0;
    ioctlsocket(s, FIONBIO, &nb);
    DWORD to = 1500;
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char *)&to, sizeof to);
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char *)&to, sizeof to);
    const char *req = "GET /version.json HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if (send(s, req, (int)strlen(req), 0) <= 0) goto done;
    char buf[4096];
    int len = 0, k;
    while (len < (int)sizeof buf - 1 && (k = recv(s, buf + len, (int)sizeof buf - 1 - len, 0)) > 0) len += k;
    buf[len] = 0;
    if (strncmp(buf, "HTTP/1.", 7) != 0 || len < 12 || strncmp(buf + 8, " 200", 4) != 0) goto done;
    char *p = strstr(buf, "\"name\"");
    if (!p) goto done;
    p += 6;
    while (*p == ' ' || *p == '\t') p++;
    if (*p != ':') goto done;
    p++;
    while (*p == ' ' || *p == '\t') p++;
    ok = strncmp(p, "\"ZeroTyperance\"", 15) == 0;
done:
    closesocket(s);
    return ok;
}

// ---------------------------------------------------------------- children
static HANDLE spawn(const wchar_t *exe, const wchar_t *args)
{
    wchar_t cmd[PATHCAP * 2];
    _snwprintf(cmd, PATHCAP * 2 - 1, L"\"%ls\" %ls", exe, args);
    cmd[PATHCAP * 2 - 1] = 0;
    STARTUPINFOW si;
    memset(&si, 0, sizeof si);
    si.cb = sizeof si;
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdInput = g_nul;
    si.hStdOutput = g_log;
    si.hStdError = g_log;
    PROCESS_INFORMATION pi;
    if (!CreateProcessW(exe, cmd, NULL, NULL, TRUE, CREATE_NO_WINDOW | CREATE_SUSPENDED, NULL, g_dir, &si, &pi)) {
        logw(L"[launcher] cannot start %ls (error %lu)", exe, GetLastError());
        return NULL;
    }
#ifndef ZT_NO_JOB   // test builds only: the negative check of test_launcher.ps1
    if (!AssignProcessToJobObject(g_job, pi.hProcess))
        logw(L"[launcher] cannot put the child into the job (error %lu)", GetLastError());
    if (g_quitting) TerminateJobObject(g_job, 0);
#endif
    ResumeThread(pi.hThread);
    CloseHandle(pi.hThread);
    return pi.hProcess;
}

// 1 = exited, 0 = timeout, -1 = launcher is quitting
static int wait_proc(HANDLE p, DWORD ms)
{
    HANDLE h[2] = { p, g_quitEvt };
    DWORD r = WaitForMultipleObjects(2, h, FALSE, ms);
    return r == WAIT_OBJECT_0 ? 1 : r == WAIT_OBJECT_0 + 1 ? -1 : 0;
}

static DWORD WINAPI worker(LPVOID unused)
{
    (void)unused;
    WSADATA wd;
    WSAStartup(MAKEWORD(2, 2), &wd);
    wchar_t node[PATHCAP], rom[PATHCAP], fetch[PATHCAP], launch[PATHCAP], args[PATHCAP];
    _snwprintf(node, PATHCAP - 1, L"%ls\\node\\node.exe", g_dir);
    _snwprintf(rom, PATHCAP - 1, L"%ls\\rom\\Zerotole.bin", g_dir);
    _snwprintf(fetch, PATHCAP - 1, L"%ls\\fetch_rom.mjs", g_dir);
    _snwprintf(launch, PATHCAP - 1, L"%ls\\launch.mjs", g_dir);
    node[PATHCAP - 1] = rom[PATHCAP - 1] = fetch[PATHCAP - 1] = launch[PATHCAP - 1] = 0;

    if (!file_exists(node) || !file_exists(launch)) {
        logw(L"[launcher] missing %ls", file_exists(node) ? launch : node);
        _snwprintf(g_failWhy, 255, L"The program files are incomplete (node\\node.exe or launch.mjs is missing).");
        PostMessageW(g_hwnd, WM_W_FAIL, 0, 0);
        return 0;
    }
    if (!file_exists(rom) && file_exists(fetch)) {
        PostMessageW(g_hwnd, WM_W_ROMBALLOON, 0, 0);
        logw(L"[launcher] no ROM image: running fetch_rom.mjs");
        _snwprintf(args, PATHCAP - 1, L"\"%ls\"", fetch);
        HANDLE f = spawn(node, args);
        if (f) {
            int w = wait_proc(f, 180000);
            if (w < 0) return 0;
            if (w == 0) {
                logw(L"[launcher] fetch_rom.mjs took longer than 180 s: stopped");
                TerminateProcess(f, 1);
            } else {
                DWORD c = 0;
                GetExitCodeProcess(f, &c);
                logw(L"[launcher] fetch_rom.mjs exited %lu (not fatal: the page asks for a ROM image)", c);
            }
            CloseHandle(f);
        }
    }

    _snwprintf(args, PATHCAP - 1, L"\"%ls\" --no-open --port %d", launch, g_port);
    logw(L"[launcher] starting node launch.mjs --no-open --port %d", g_port);
    HANDLE n = spawn(node, args);
    if (!n) {
        _snwprintf(g_failWhy, 255, L"node.exe could not be started.");
        PostMessageW(g_hwnd, WM_W_FAIL, 0, 0);
        return 0;
    }
    DWORD t0 = GetTickCount();
    for (;;) {
        if (probe_ours(g_port)) break;
        int w = wait_proc(n, 250);
        if (w < 0) return 0;
        if (w == 1) {
            DWORD c = 1;
            GetExitCodeProcess(n, &c);
            logw(L"[launcher] node exited with %lu before the server answered on port %d", c, g_port);
            if (c == 0 && probe_ours(g_port)) {
                logw(L"[launcher] ZeroTyperance already runs on port %d", g_port);
                PostMessageW(g_hwnd, WM_W_EXITOK, 0, 0);
            } else {
                _snwprintf(g_failWhy, 255, L"ZeroTyperance did not start on port %d (node exited with %lu).", g_port, c);
                logw(L"[launcher] ZeroTyperance did not start on port %d", g_port);
                PostMessageW(g_hwnd, WM_W_FAIL, 0, 0);
            }
            return 0;
        }
        if (GetTickCount() - t0 > 30000) {
            logw(L"[launcher] no answer from http://127.0.0.1:%d/version.json within 30 s", g_port);
            _snwprintf(g_failWhy, 255, L"ZeroTyperance did not answer on port %d within 30 s.", g_port);
            PostMessageW(g_hwnd, WM_W_FAIL, 0, 0);
            return 0;
        }
    }
    logw(L"[launcher] server answers on port %d (%lu ms)", g_port, GetTickCount() - t0);
    InterlockedExchange(&g_ready, 1);
    PostMessageW(g_hwnd, WM_W_READY, 0, 0);
    if (wait_proc(n, INFINITE) == 1) {
        DWORD c = 1;
        GetExitCodeProcess(n, &c);
        logw(L"[launcher] node exited with %lu while running", c);
        PostMessageW(g_hwnd, WM_W_NODEDIED, (WPARAM)c, 0);
    }
    return 0;
}

// ---------------------------------------------------------------- the browser window
static int app_path(const wchar_t *exe, wchar_t *out, DWORD cap)
{
    wchar_t key[160];
    _snwprintf(key, 159, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\%ls", exe);
    key[159] = 0;
    HKEY roots[2] = { HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE };
    for (int i = 0; i < 2; i++) {
        DWORD sz = cap * sizeof(wchar_t);
        if (RegGetValueW(roots[i], key, NULL, RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ, NULL, out, &sz) == ERROR_SUCCESS) {
            size_t l = wcslen(out);
            if (l >= 2 && out[0] == L'"' && out[l - 1] == L'"') {
                memmove(out, out + 1, (l - 2) * sizeof(wchar_t));
                out[l - 2] = 0;
            }
            if (file_exists(out)) return 1;
        }
    }
    return 0;
}

static int under_env(const wchar_t *var, const wchar_t *rel, wchar_t *out, DWORD cap)
{
    wchar_t base[MAX_PATH];
    DWORD n = GetEnvironmentVariableW(var, base, MAX_PATH);
    if (n == 0 || n >= MAX_PATH) return 0;
    _snwprintf(out, cap - 1, L"%ls\\%ls", base, rel);
    out[cap - 1] = 0;
    return file_exists(out);
}

static int run_app(const wchar_t *exe, const wchar_t *url)
{
    wchar_t cmd[PATHCAP * 2];
    _snwprintf(cmd, PATHCAP * 2 - 1, L"\"%ls\" --app=%ls", exe, url);
    cmd[PATHCAP * 2 - 1] = 0;
    STARTUPINFOW si;
    memset(&si, 0, sizeof si);
    si.cb = sizeof si;
    PROCESS_INFORMATION pi;
    if (!CreateProcessW(exe, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) return 0;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    logw(L"[launcher] opened %ls", cmd);
    return 1;
}

static void open_window(void)
{
    wchar_t url[64], p[PATHCAP];
    _snwprintf(url, 63, L"http://localhost:%d/", g_port);
    url[63] = 0;
    if (app_path(L"msedge.exe", p, PATHCAP) || under_env(L"ProgramFiles(x86)", L"Microsoft\\Edge\\Application\\msedge.exe", p, PATHCAP) ||
        under_env(L"ProgramFiles", L"Microsoft\\Edge\\Application\\msedge.exe", p, PATHCAP))
        if (run_app(p, url)) return;
    if (app_path(L"chrome.exe", p, PATHCAP) || under_env(L"ProgramFiles", L"Google\\Chrome\\Application\\chrome.exe", p, PATHCAP) ||
        under_env(L"ProgramFiles(x86)", L"Google\\Chrome\\Application\\chrome.exe", p, PATHCAP) ||
        under_env(L"LOCALAPPDATA", L"Google\\Chrome\\Application\\chrome.exe", p, PATHCAP))
        if (run_app(p, url)) return;
    logw(L"[launcher] no Edge or Chrome: opening %ls with the default browser", url);
    ShellExecuteW(NULL, L"open", url, NULL, NULL, SW_SHOWNORMAL);
}

// ---------------------------------------------------------------- tray
static void tray_add(void)
{
    Shell_NotifyIconW(NIM_ADD, &g_nid);
}

static void balloon(const wchar_t *title, const wchar_t *text)
{
    NOTIFYICONDATAW n = g_nid;
    n.uFlags = NIF_INFO;
    wcsncpy(n.szInfoTitle, title, 63);
    n.szInfoTitle[63] = 0;
    wcsncpy(n.szInfo, text, 255);
    n.szInfo[255] = 0;
    n.dwInfoFlags = NIIF_INFO;
    Shell_NotifyIconW(NIM_MODIFY, &n);
}

static void tray_menu(HWND h)
{
    HMENU m = CreatePopupMenu();
    AppendMenuW(m, MF_STRING, ID_OPEN, L"Open ZeroTyperance");
    AppendMenuW(m, MF_STRING, ID_QUIT, L"Quit");
    SetMenuDefaultItem(m, ID_OPEN, FALSE);
    POINT pt;
    GetCursorPos(&pt);
    SetForegroundWindow(h);
    TrackPopupMenu(m, TPM_RIGHTBUTTON, pt.x, pt.y, 0, h, NULL);
    PostMessageW(h, WM_NULL, 0, 0);
    DestroyMenu(m);
}

static void do_open(void)
{
    if (g_ready) open_window();
    else g_wantOpen = 1;
}

static void fail_box(void)
{
    g_exit = 1;
    if (!g_test) {
        wchar_t tail[2400], msg[3000];
        log_tail(tail, 2400, 12);
        _snwprintf(msg, 2999, L"%ls\n\nThe log is %ls\n\n%ls", g_failWhy, g_logpath, tail);
        msg[2999] = 0;
        MessageBoxW(NULL, msg, L"ZeroTyperance", MB_OK | MB_ICONERROR);
    }
}

static LRESULT CALLBACK wndproc(HWND h, UINT m, WPARAM w, LPARAM l)
{
    if (g_msgTaskbar && m == g_msgTaskbar) {
        tray_add();
        return 0;
    }
    switch (m) {
    case WM_TRAY:
        if (LOWORD(l) == WM_LBUTTONDBLCLK) do_open();
        else if (LOWORD(l) == WM_RBUTTONUP || LOWORD(l) == WM_CONTEXTMENU) tray_menu(h);
        return 0;
    case WM_COMMAND:
        if (LOWORD(w) == ID_OPEN) do_open();
        else if (LOWORD(w) == ID_QUIT) PostMessageW(h, WM_CLOSE, 0, 0);
        return 0;
    case WM_SHOWREQ:
        logw(L"[launcher] another start asked for the window");
        do_open();
        return 0;
    case WM_W_ROMBALLOON:
        balloon(L"ZeroTyperance", L"Getting the ROM image from technopop.net (first start)");
        return 0;
    case WM_W_READY:
        balloon(L"ZeroTyperance", L"ZeroTyperance keeps running here: right-click, Quit to stop it.");
        if (g_open || g_wantOpen) open_window();
        return 0;
    case WM_W_EXITOK:
        if (g_open || g_wantOpen) open_window();
        g_exit = 0;
        DestroyWindow(h);
        return 0;
    case WM_W_FAIL:
        fail_box();
        DestroyWindow(h);
        return 0;
    case WM_W_NODEDIED:
        _snwprintf(g_failWhy, 255, L"The game server stopped (node exited with %lu).", (unsigned long)w);
        fail_box();
        DestroyWindow(h);
        return 0;
    case WM_DESTROY:
        InterlockedExchange(&g_quitting, 1);
        SetEvent(g_quitEvt);
        TerminateJobObject(g_job, 0);
        Shell_NotifyIconW(NIM_DELETE, &g_nid);
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(h, m, w, l);
}

// ---------------------------------------------------------------- startup
static void window_title(wchar_t *t, int port)
{
    _snwprintf(t, 63, L"ZeroTyperance port %d", port);
    t[63] = 0;
}

static HWND find_instance(int port, DWORD ms)
{
    wchar_t t[64];
    window_title(t, port);
    DWORD t0 = GetTickCount();
    for (;;) {
        HWND h = FindWindowW(CLASS_NAME, t);
        if (h) return h;
        if (GetTickCount() - t0 >= ms) return NULL;
        Sleep(50);
    }
}

static int mutex_exists(const wchar_t *name)
{
    HANDLE h = OpenMutexW(SYNCHRONIZE, FALSE, name);
    if (!h) return 0;
    CloseHandle(h);
    return 1;
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE prev, LPWSTR cmdline, int show)
{
    (void)prev; (void)cmdline; (void)show;
    g_inst = hi;
    int quit = 0, argc = 0;
    wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    for (int i = 1; argv && i < argc; i++) {
        if (!wcscmp(argv[i], L"--port") && i + 1 < argc) {
            wchar_t *e;
            long v = wcstol(argv[++i], &e, 10);
            if (*e || v < 1 || v > 65535) return 2;
            g_port = (int)v;
        } else if (!wcscmp(argv[i], L"--no-open")) g_open = 0;
        else if (!wcscmp(argv[i], L"--quit")) quit = 1;
    }
    wchar_t tv[8];
    g_test = GetEnvironmentVariableW(L"ZT_LAUNCHER_TEST", tv, 8) > 0 && tv[0] == L'1';

    wchar_t mname[64];
    _snwprintf(mname, 63, L"Local\\ZeroTyperance-%d", g_port);
    mname[63] = 0;

    if (quit) {
        if (!mutex_exists(mname)) return 0;
        HWND h = find_instance(g_port, 3000);
        if (h) PostMessageW(h, WM_CLOSE, 0, 0);
        for (int i = 0; i < 100 && mutex_exists(mname); i++) Sleep(50);
        return 0;
    }

    HANDLE mtx = CreateMutexW(NULL, FALSE, mname);
    if (mtx && GetLastError() == ERROR_ALREADY_EXISTS) {
        if (g_open) {
            HWND h = find_instance(g_port, 3000);
            if (h) PostMessageW(h, WM_SHOWREQ, 0, 0);
        }
        return 0;
    }

    DWORD n = GetModuleFileNameW(NULL, g_dir, PATHCAP - 1);
    if (n == 0 || n >= PATHCAP - 1) return 3;
    wchar_t *sl = wcsrchr(g_dir, L'\\');
    if (!sl) return 3;
    *sl = 0;

    InitializeCriticalSection(&g_cs);
    open_log();
    logw(L"[launcher] ZeroTyperance launcher, folder %ls, port %d", g_dir, g_port);

    g_quitEvt = CreateEventW(NULL, TRUE, FALSE, NULL);
    g_job = CreateJobObjectW(NULL, NULL);
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION li;
    memset(&li, 0, sizeof li);
    li.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!g_job || !SetInformationJobObject(g_job, JobObjectExtendedLimitInformation, &li, sizeof li))
        logw(L"[launcher] job object setup failed (error %lu)", GetLastError());

    WNDCLASSEXW wc;
    memset(&wc, 0, sizeof wc);
    wc.cbSize = sizeof wc;
    wc.lpfnWndProc = wndproc;
    wc.hInstance = hi;
    wc.lpszClassName = CLASS_NAME;
    HICON icon = LoadIconW(hi, MAKEINTRESOURCEW(1));
    wc.hIcon = icon;
    RegisterClassExW(&wc);
    wchar_t title[64];
    window_title(title, g_port);
    g_hwnd = CreateWindowExW(0, CLASS_NAME, title, WS_POPUP, 0, 0, 0, 0, NULL, NULL, hi, NULL);
    if (!g_hwnd) return 3;

    g_msgTaskbar = RegisterWindowMessageW(L"TaskbarCreated");
    memset(&g_nid, 0, sizeof g_nid);
    g_nid.cbSize = sizeof g_nid;
    g_nid.hWnd = g_hwnd;
    g_nid.uID = 1;
    g_nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    g_nid.uCallbackMessage = WM_TRAY;
    g_nid.hIcon = icon ? icon : LoadIconW(NULL, IDI_APPLICATION);
    _snwprintf(g_nid.szTip, 127, L"ZeroTyperance (port %d)", g_port);
    tray_add();

    HANDLE th = CreateThread(NULL, 0, worker, NULL, 0, NULL);
    if (th) CloseHandle(th);

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    logw(L"[launcher] exit %d", g_exit);
    return g_exit;
}
