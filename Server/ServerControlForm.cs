using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PAHServer
{
    public class ServerControlForm : Form
    {
        private Button btnStart = null!;
        private Button btnStop = null!;
        private Button btnCleanDB = null!;
        private Button btnOpenBrowser = null!;
        private RichTextBox txtLog = null!;
        private ServerHost _serverHost = null!;
        private bool _isRunning = false;
        private int _currentPort = 5009;

        public ServerControlForm()
        {
            InitializeComponent();
            SetApplicationIcon();

            _serverHost = new ServerHost(Log);

            Log(@"========================================================================");
            Log(@"  _____        _    _           _____ _______ _    _ _____ _____ ____  ");
            Log(@" |  __ \ /\   | |  | |         / ____|__   __| |  | |  __ \_   _/ __ \ ");
            Log(@" | |__) /  \  | |__| |        | (___    | |  | |  | | |  | || || |  | |");
            Log(@" |  ___/ /\ \ |  __  |         \___ \   | |  | |  | | |  | || || |  | |");
            Log(@" | |  / ____ \| |  | |         ____) |  | |  | |__| | |__| || || |__| |");
            Log(@" |_| /_/    \_\_|  |_|        |_____/   |_|   \____/|_____/_____\____/ ");
            Log(@"                                                                          ");
            Log(@"========================================================================");
            Log("System: PAH Studio 1.4 Pixel Cake");
            Log("Engine: Parrot Core 2.2");
            Log("Copyright: \u00A9 2026 PAH Studio");
            Log("Made by: Hnato");
            Log("");
            Log("");

            this.Shown += async (s, e) => await StartServer();
        }

        private void SetApplicationIcon()
        {
            try
            {
                var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                var icoPath = Path.Combine(baseDir, "PAH.ico");
                if (File.Exists(icoPath))
                {
                    this.Icon = new Icon(icoPath);
                    return;
                }

                var serverIcoPath = Path.Combine(baseDir, "Server", "PAH.ico");
                if (File.Exists(serverIcoPath))
                {
                    this.Icon = new Icon(serverIcoPath);
                    return;
                }

                var asm = Assembly.GetExecutingAssembly();
                using var stream = asm.GetManifestResourceStream("PAHServer.PAH.ico") 
                                ?? asm.GetManifestResourceStream("PAH.ico");
                if (stream != null)
                {
                    this.Icon = new Icon(stream);
                    return;
                }

                var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon != null) this.Icon = exeIcon;
            }
            catch { }
        }

        private void InitializeComponent()
        {
            this.Text = "PAH Studio Manager";
            this.Size = new Size(820, 620);
            this.BackColor = Color.FromArgb(20, 26, 23);
            this.ForeColor = Color.White;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MinimumSize = new Size(650, 450);

            Label lblTitle = new Label();
            lblTitle.Text = "PAH Studio";
            lblTitle.Font = new Font("Segoe UI", 22, FontStyle.Bold);
            lblTitle.Location = new Point(20, 16);
            lblTitle.AutoSize = true;
            lblTitle.ForeColor = Color.FromArgb(46, 204, 113);
            this.Controls.Add(lblTitle);

            Panel pnlButtons = new Panel();
            pnlButtons.Location = new Point(20, 70);
            pnlButtons.Size = new Size(760, 50);
            pnlButtons.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            this.Controls.Add(pnlButtons);

            btnStart = CreateButton("Uruchom Serwer", 0, Color.FromArgb(46, 204, 113));
            btnStart.Click += async (s, e) => await StartServer();
            pnlButtons.Controls.Add(btnStart);

            btnStop = CreateButton("Zatrzymaj", 160, Color.FromArgb(231, 76, 60));
            btnStop.Click += async (s, e) => await StopServer();
            btnStop.Enabled = false;
            pnlButtons.Controls.Add(btnStop);

            btnCleanDB = CreateButton("Wyczyść Bazę", 320, Color.FromArgb(243, 156, 18));
            btnCleanDB.Click += BtnCleanDB_Click;
            pnlButtons.Controls.Add(btnCleanDB);

            btnOpenBrowser = CreateButton("Otwórz App", 480, Color.FromArgb(52, 152, 219));
            btnOpenBrowser.Click += (s, e) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo($"http://localhost:{_currentPort}") { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    Log($"Błąd otwierania przeglądarki: {ex.Message}");
                }
            };
            pnlButtons.Controls.Add(btnOpenBrowser);

            txtLog = new RichTextBox();
            txtLog.Location = new Point(20, 130);
            txtLog.Size = new Size(760, 430);
            txtLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            txtLog.BackColor = Color.FromArgb(13, 18, 15);
            txtLog.ForeColor = Color.FromArgb(230, 240, 235);
            txtLog.Font = new Font("Consolas", 10);
            txtLog.ReadOnly = true;
            txtLog.BorderStyle = BorderStyle.None;
            this.Controls.Add(txtLog);
        }

        private Button CreateButton(string text, int x, Color backColor)
        {
            Button btn = new Button();
            btn.Text = text;
            btn.Location = new Point(x, 0);
            btn.Size = new Size(145, 42);
            btn.FlatStyle = FlatStyle.Flat;
            btn.BackColor = backColor;
            btn.ForeColor = Color.White;
            btn.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btn.Cursor = Cursors.Hand;
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        public void Log(string message)
        {
            if (txtLog.InvokeRequired)
            {
                txtLog.Invoke(new Action<string>(Log), message);
                return;
            }
            txtLog.AppendText(message + Environment.NewLine);
            txtLog.ScrollToCaret();
        }

        private async Task StartServer()
        {
            if (_isRunning) return;
            btnStart.Enabled = false;
            btnCleanDB.Enabled = false;
            try
            {
                _currentPort = await _serverHost.StartAsync();
                _isRunning = true;
                btnStop.Enabled = true;
            }
            catch (Exception ex)
            {
                Log($"Błąd uruchamiania: {ex.Message}");
                btnStart.Enabled = true;
                btnCleanDB.Enabled = true;
            }
        }

        private async Task StopServer()
        {
            if (!_isRunning) return;
            btnStop.Enabled = false;
            try
            {
                await _serverHost.StopAsync();
                _isRunning = false;
                btnStart.Enabled = true;
                btnCleanDB.Enabled = true;
                Log("Serwer został zatrzymany.");
            }
            catch (Exception ex)
            {
                Log($"Błąd zatrzymywania: {ex.Message}");
            }
        }

        private void BtnCleanDB_Click(object? sender, EventArgs e)
        {
            if (_isRunning)
            {
                MessageBox.Show("Zatrzymaj serwer przed czyszczeniem bazy danych!", "Ostrzeżenie", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (MessageBox.Show("Czy na pewno chcesz wyczyścić bazę danych? Ta operacja usunie wszystkie dane.", "Potwierdzenie", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
            {
                try
                {
                    string dataDir = ServerHost.ResolveDataDirectory();
                    string dbPath = Path.Combine(dataDir, "pah.db");
                    string shmPath = dbPath + "-shm";
                    string walPath = dbPath + "-wal";
                    bool deleted = false;

                    if (File.Exists(dbPath)) { File.Delete(dbPath); deleted = true; }
                    if (File.Exists(shmPath)) File.Delete(shmPath);
                    if (File.Exists(walPath)) File.Delete(walPath);

                    if (deleted) Log("[DB Info] Baza danych została wyczyszczona.");
                    else Log("[DB Info] Plik bazy danych nie istnieje.");
                }
                catch (Exception ex)
                {
                    Log($"Błąd czyszczenia bazy: {ex.Message}");
                }
            }
        }

        protected override async void OnFormClosing(FormClosingEventArgs e)
        {
            if (_isRunning)
            {
                e.Cancel = true;
                await StopServer();
                e.Cancel = false;
                this.Close();
            }
            base.OnFormClosing(e);
        }
    }
}
