using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PAHServer
{
    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            if (args.Contains("--server") || args.Contains("--nogui"))
            {
                RunHeadlessServer(args).GetAwaiter().GetResult();
                return;
            }

            using var mutex = new Mutex(true, "PAHStudioApp", out bool createdNew);
            if (!createdNew)
            {
                return;
            }

            ApplicationConfiguration.Initialize();
            Application.Run(new ServerControlForm());
        }

        private static async Task RunHeadlessServer(string[] args)
        {
            Console.Title = "PAH Studio";
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine(@"
========================================================================
  _____        _    _           _____ _______ _    _ _____ _____ ____  
 |  __ \ /\   | |  | |         / ____|__   __| |  | |  __ \_   _/ __ \ 
 | |__) /  \  | |__| |        | (___    | |  | |  | | |  | || || |  | |
 |  ___/ /\ \ |  __  |         \___ \   | |  | |  | | |  | || || |  | |
 | |  / ____ \| |  | |         ____) |  | |  | |__| | |__| || || |__| |
 |_| /_/    \_\_|  |_|        |_____/   |_|   \____/|_____/_____\____/ 
                                                                          
========================================================================");

            Console.WriteLine("System: PAH Studio 1.4 Pixel Cake");
            Console.WriteLine("Engine: Parrot Core 2.2");
            Console.WriteLine("Copyright: \u00A9 2026 PAH Studio");
            Console.WriteLine("Made by: Hnato");
            Console.WriteLine();
            Console.WriteLine();

            var host = new ServerHost(msg => Console.WriteLine(msg));
            try
            {
                await host.StartAsync();
                Console.WriteLine("\nAby zatrzymać serwer, naciśnij Ctrl+C.\n");
                await Task.Delay(-1);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.Error.WriteLine($"\n[BŁĄD]: {ex.Message}");
                Console.ResetColor();
            }
        }
    }
}
