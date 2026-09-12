using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace PAHServer
{
    public class ServerHost
    {
        private WebApplication? _app;
        private readonly Action<string> _logAction;
        private int _selectedPort = 5009;

        public ServerHost(Action<string> logAction)
        {
            _logAction = logAction;
        }

        public async Task<int> StartAsync()
        {
            string dataDir = ResolveDataDirectory();
            string dbPath = Path.Combine(dataDir, "pah.db");
            _logAction($"[DB Info] Using database file: {dbPath}");
            _logAction("Serwer uruchamiany...");

            DatabaseService.Initialize(dbPath, dataDir);

            int targetPort = 5009;
            if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var envPort))
            {
                targetPort = envPort;
            }

            _selectedPort = FindAvailablePort(targetPort);

            if (_selectedPort != targetPort)
            {
                if (await IsHttpRespondingAsync($"http://localhost:{targetPort}"))
                {
                    _logAction($"\n[PAH Studio] Aplikacja jest już uruchomiona na porcie {targetPort}!");
                    _logAction($"Serwer działa na: http://0.0.0.0:{targetPort}");
                    _logAction($"Lokalnie: http://localhost:{targetPort}\n");
                    return targetPort;
                }
                _logAction($"[PAH Studio] Port {targetPort} jest zajęty, używam wolnego portu: {_selectedPort}");
            }

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = Array.Empty<string>(),
                ContentRootPath = AppContext.BaseDirectory
            });

            builder.Logging.ClearProviders();

            _app = builder.Build();

            var api = _app.MapGroup("/api");

            // --- Community Projects ---
            api.MapGet("/community", async () =>
            {
                var projects = await DatabaseService.GetCommunityProjectsAsync();
                return Results.Ok(projects);
            });

            api.MapPost("/community", async (HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.SaveCommunityProjectAsync(rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(result.Project);
            });

            api.MapPost("/community/{id}/like", async (string id, HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.LikeCommunityProjectAsync(id, rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(new { success = true, likes = result.Likes, isLiked = result.IsLiked });
            });

            api.MapDelete("/community/{id}", async (string id) =>
            {
                var deleted = await DatabaseService.DeleteCommunityProjectAsync(id);
                return Results.Ok(new { success = deleted });
            });

            // --- Comments ---
            api.MapGet("/community/{id}/comments", async (string id) =>
            {
                var comments = await DatabaseService.GetCommentsAsync(id);
                return Results.Ok(comments);
            });

            api.MapPost("/community/{id}/comments", async (string id, HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.AddCommentAsync(id, rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(result.Comment);
            });

            // --- Authentication ---
            api.MapPost("/auth/register", async (HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.RegisterUserAsync(rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(result.User);
            });

            api.MapPost("/auth/login", async (HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.LoginUserAsync(rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(result.User);
            });

            api.MapPost("/auth/profile", async (HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.UpdateUserProfileAsync(rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(result.User);
            });

            // --- Public User Profiles ---
            api.MapGet("/users/{userId}", async (string userId) =>
            {
                var user = await DatabaseService.GetUserPublicProfileAsync(userId);
                if (user == null) return Results.NotFound(new { message = "Nie znaleziono użytkownika." });
                return Results.Ok(user);
            });

            api.MapGet("/users/{userId}/projects", async (string userId) =>
            {
                var projects = await DatabaseService.GetUserProjectsAsync(userId);
                return Results.Ok(projects);
            });

            api.MapPost("/users/{userId}/projects", async (string userId, HttpRequest request) =>
            {
                using var reader = new StreamReader(request.Body);
                var rawJson = await reader.ReadToEndAsync();
                var result = await DatabaseService.SaveUserProjectAsync(userId, rawJson);
                if (!result.Success) return Results.BadRequest(new { message = result.Error });
                return Results.Ok(result.Project);
            });

            api.MapDelete("/users/{userId}/projects/{projectId}", async (string userId, string projectId) =>
            {
                var deleted = await DatabaseService.DeleteUserProjectAsync(userId, projectId);
                return Results.Ok(new { success = deleted });
            });

            IFileProvider fileProvider = ResolveFileProvider();

            _app.UseDefaultFiles(new DefaultFilesOptions
            {
                FileProvider = fileProvider,
                RequestPath = ""
            });

            _app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = fileProvider,
                RequestPath = "",
                ServeUnknownFileTypes = true,
                DefaultContentType = "application/octet-stream"
            });

            _app.MapFallback(async context =>
            {
                if (context.Request.Path.StartsWithSegments("/api"))
                {
                    context.Response.StatusCode = 404;
                    await context.Response.WriteAsJsonAsync(new { error = "Not found" });
                    return;
                }

                var indexFile = fileProvider.GetFileInfo("index.html");
                if (indexFile.Exists)
                {
                    context.Response.ContentType = "text/html; charset=utf-8";
                    await using var stream = indexFile.CreateReadStream();
                    await stream.CopyToAsync(context.Response.Body);
                }
                else
                {
                    context.Response.StatusCode = 404;
                    await context.Response.WriteAsync("Nie znaleziono pliku index.html.");
                }
            });

            string urlLocal = $"http://localhost:{_selectedPort}";
            string urlAll = $"http://0.0.0.0:{_selectedPort}";

            _logAction($"Serwer działa na: {urlAll}");
            _logAction($"Lokalnie: {urlLocal}");

            _ = _app.RunAsync(urlAll);

            return _selectedPort;
        }

        public async Task StopAsync()
        {
            if (_app != null)
            {
                await _app.StopAsync();
                await _app.DisposeAsync();
                _app = null;
            }
        }

        public static string ResolveDataDirectory()
        {
            string baseDir = AppContext.BaseDirectory;
            string localData = Path.Combine(baseDir, "Data");
            if (Directory.Exists(localData)) return localData;

            string parentData = Path.Combine(baseDir, "..", "Data");
            if (Directory.Exists(parentData)) return Path.GetFullPath(parentData);

            try
            {
                Directory.CreateDirectory(localData);
                return localData;
            }
            catch
            {
                string appData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "PAHStudio", "Data");
                Directory.CreateDirectory(appData);
                return appData;
            }
        }

        public static IFileProvider ResolveFileProvider()
        {
            string baseDir = AppContext.BaseDirectory;
            string clientDir = Path.Combine(baseDir, "Client");
            if (Directory.Exists(clientDir) && File.Exists(Path.Combine(clientDir, "index.html")))
            {
                return new PhysicalFileProvider(clientDir);
            }

            string parentClient = Path.Combine(baseDir, "..", "Client");
            if (Directory.Exists(parentClient) && File.Exists(Path.Combine(parentClient, "index.html")))
            {
                return new PhysicalFileProvider(Path.GetFullPath(parentClient));
            }

            var asm = Assembly.GetExecutingAssembly();
            return new EmbeddedFileProvider(asm, "PAHServer.EmbeddedClient");
        }

        private static int FindAvailablePort(int startPort)
        {
            for (int port = startPort; port < startPort + 100; port++)
            {
                try
                {
                    using var listener = new TcpListener(System.Net.IPAddress.Loopback, port);
                    listener.Start();
                    listener.Stop();
                    return port;
                }
                catch (SocketException) { }
            }
            return startPort;
        }

        private static async Task<bool> IsHttpRespondingAsync(string url)
        {
            try
            {
                using var client = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMilliseconds(400) };
                var response = await client.GetAsync(url);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }
    }
}
