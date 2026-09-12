using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace PAHServer
{
    public static class DatabaseService
    {
        private static string _connectionString = "";
        private static readonly object _dbLock = new();

        public static void Initialize(string dbPath, string dataDir)
        {
            _connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = dbPath,
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        username TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        avatar_icon TEXT,
                        avatar_color TEXT,
                        bio TEXT,
                        featured_enabled INTEGER DEFAULT 1,
                        featured_project_ids TEXT
                    );

                    CREATE TABLE IF NOT EXISTS community_projects (
                        id TEXT PRIMARY KEY,
                        author_id TEXT,
                        author TEXT,
                        name TEXT,
                        description TEXT,
                        tags TEXT,
                        width INTEGER,
                        height INTEGER,
                        fps INTEGER,
                        palette TEXT,
                        frames TEXT,
                        likes INTEGER DEFAULT 0,
                        liked_by TEXT,
                        is_public INTEGER DEFAULT 1,
                        created_at TEXT,
                        published_at TEXT,
                        updated_at TEXT
                    );

                    CREATE TABLE IF NOT EXISTS user_projects (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        author TEXT,
                        name TEXT,
                        description TEXT,
                        tags TEXT,
                        width INTEGER,
                        height INTEGER,
                        fps INTEGER,
                        palette TEXT,
                        frames TEXT,
                        created_at TEXT,
                        updated_at TEXT
                    );

                    CREATE TABLE IF NOT EXISTS comments (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        user_id TEXT,
                        username TEXT,
                        text TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    );
                ";
                cmd.ExecuteNonQuery();
            }

            MigrateLegacyFiles(dataDir);
        }

        private static void MigrateLegacyFiles(string dataDir)
        {
            try
            {
                string usersDir = Path.Combine(dataDir, "Users");
                if (Directory.Exists(usersDir))
                {
                    foreach (var f in Directory.GetFiles(usersDir, "*.json"))
                    {
                        try
                        {
                            var text = File.ReadAllText(f);
                            var node = JsonNode.Parse(text);
                            if (node != null)
                            {
                                string id = node["id"]?.GetValue<string>() ?? Path.GetFileNameWithoutExtension(f);
                                string username = node["username"]?.GetValue<string>() ?? "";
                                string hash = node["passwordHash"]?.GetValue<string>() ?? "";
                                string createdAt = node["createdAt"]?.GetValue<string>() ?? DateTime.UtcNow.ToString("o");
                                string avatarIcon = node["avatarIcon"]?.GetValue<string>() ?? "fa-user-astronaut";
                                string avatarColor = node["avatarColor"]?.GetValue<string>() ?? "#ffd700";
                                string bio = node["bio"]?.GetValue<string>() ?? "";
                                string featured = node["featuredProjectIds"]?.ToJsonString() ?? "[]";

                                if (!string.IsNullOrEmpty(username))
                                {
                                    lock (_dbLock)
                                    {
                                        using var conn = new SqliteConnection(_connectionString);
                                        conn.Open();
                                        using var cmd = conn.CreateCommand();
                                        cmd.CommandText = @"
                                            INSERT OR IGNORE INTO users (id, username, password_hash, created_at, avatar_icon, avatar_color, bio, featured_enabled, featured_project_ids)
                                            VALUES (@id, @username, @hash, @createdAt, @avatarIcon, @avatarColor, @bio, 1, @featured);
                                        ";
                                        cmd.Parameters.AddWithValue("@id", id);
                                        cmd.Parameters.AddWithValue("@username", username);
                                        cmd.Parameters.AddWithValue("@hash", hash);
                                        cmd.Parameters.AddWithValue("@createdAt", createdAt);
                                        cmd.Parameters.AddWithValue("@avatarIcon", avatarIcon);
                                        cmd.Parameters.AddWithValue("@avatarColor", avatarColor);
                                        cmd.Parameters.AddWithValue("@bio", bio);
                                        cmd.Parameters.AddWithValue("@featured", featured);
                                        cmd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }

                string commDir = Path.Combine(dataDir, "Community");
                if (Directory.Exists(commDir))
                {
                    foreach (var f in Directory.GetFiles(commDir, "*.json"))
                    {
                        try
                        {
                            var text = File.ReadAllText(f);
                            SaveCommunityProjectAsync(text).GetAwaiter().GetResult();
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        public static Task<List<JsonNode>> GetCommunityProjectsAsync()
        {
            var result = new List<JsonNode>();
            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM community_projects ORDER BY published_at DESC, updated_at DESC;";
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    try
                    {
                        var node = new JsonObject
                        {
                            ["id"] = reader["id"].ToString(),
                            ["authorId"] = reader["author_id"].ToString(),
                            ["author"] = reader["author"].ToString(),
                            ["name"] = reader["name"].ToString(),
                            ["description"] = reader["description"].ToString(),
                            ["tags"] = JsonNode.Parse(reader["tags"].ToString() ?? "[]") ?? new JsonArray(),
                            ["width"] = Convert.ToInt32(reader["width"]),
                            ["height"] = Convert.ToInt32(reader["height"]),
                            ["fps"] = Convert.ToInt32(reader["fps"]),
                            ["palette"] = JsonNode.Parse(reader["palette"].ToString() ?? "[]") ?? new JsonArray(),
                            ["frames"] = JsonNode.Parse(reader["frames"].ToString() ?? "[]") ?? new JsonArray(),
                            ["likes"] = Convert.ToInt32(reader["likes"]),
                            ["likedBy"] = JsonNode.Parse(reader["liked_by"].ToString() ?? "[]") ?? new JsonArray(),
                            ["isPublic"] = Convert.ToInt32(reader["is_public"]) == 1,
                            ["createdAt"] = reader["created_at"].ToString(),
                            ["publishedAt"] = reader["published_at"].ToString(),
                            ["updatedAt"] = reader["updated_at"].ToString()
                        };
                        result.Add(node);
                    }
                    catch { }
                }
            }
            return Task.FromResult(result);
        }

        public static Task<(bool Success, JsonNode? Project, string? Error)> SaveCommunityProjectAsync(string rawJson)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(rawJson)) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Puste dane projektu."));
                var node = JsonNode.Parse(rawJson);
                if (node == null) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Nieprawidłowy JSON projektu."));

                string id = node["id"]?.GetValue<string>() ?? "";
                if (string.IsNullOrWhiteSpace(id) || id.StartsWith("pah_"))
                {
                    id = "comm_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "_" + Guid.NewGuid().ToString("N")[..6];
                    node["id"] = id;
                }

                string authorId = node["authorId"]?.GetValue<string>() ?? "guest";
                string author = node["author"]?.GetValue<string>() ?? "Twórca";
                string name = node["name"]?.GetValue<string>() ?? "Projekt";
                string description = node["description"]?.GetValue<string>() ?? "";
                string tags = (node["tags"] as JsonArray)?.ToJsonString() ?? "[\"pixelart\"]";
                int width = node["width"]?.GetValue<int>() ?? 16;
                int height = node["height"]?.GetValue<int>() ?? 16;
                int fps = node["fps"]?.GetValue<int>() ?? 8;
                string palette = (node["palette"] as JsonArray)?.ToJsonString() ?? "[]";
                string frames = (node["frames"] as JsonArray)?.ToJsonString() ?? "[]";
                int likes = node["likes"]?.GetValue<int>() ?? 0;
                string likedBy = (node["likedBy"] as JsonArray)?.ToJsonString() ?? "[]";
                string now = DateTime.UtcNow.ToString("o");
                string createdAt = node["createdAt"]?.GetValue<string>() ?? now;
                string publishedAt = node["publishedAt"]?.GetValue<string>() ?? now;

                node["isPublic"] = true;
                node["publishedAt"] = publishedAt;
                node["updatedAt"] = now;
                node["likes"] = likes;

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO community_projects (id, author_id, author, name, description, tags, width, height, fps, palette, frames, likes, liked_by, is_public, created_at, published_at, updated_at)
                        VALUES (@id, @authorId, @author, @name, @desc, @tags, @w, @h, @fps, @pal, @frames, @likes, @likedBy, 1, @createdAt, @pubAt, @upAt)
                        ON CONFLICT(id) DO UPDATE SET
                            author = excluded.author,
                            name = excluded.name,
                            description = excluded.description,
                            tags = excluded.tags,
                            width = excluded.width,
                            height = excluded.height,
                            fps = excluded.fps,
                            palette = excluded.palette,
                            frames = excluded.frames,
                            likes = excluded.likes,
                            liked_by = excluded.liked_by,
                            updated_at = excluded.updated_at;
                    ";
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@authorId", authorId);
                    cmd.Parameters.AddWithValue("@author", author);
                    cmd.Parameters.AddWithValue("@name", name);
                    cmd.Parameters.AddWithValue("@desc", description);
                    cmd.Parameters.AddWithValue("@tags", tags);
                    cmd.Parameters.AddWithValue("@w", width);
                    cmd.Parameters.AddWithValue("@h", height);
                    cmd.Parameters.AddWithValue("@fps", fps);
                    cmd.Parameters.AddWithValue("@pal", palette);
                    cmd.Parameters.AddWithValue("@frames", frames);
                    cmd.Parameters.AddWithValue("@likes", likes);
                    cmd.Parameters.AddWithValue("@likedBy", likedBy);
                    cmd.Parameters.AddWithValue("@createdAt", createdAt);
                    cmd.Parameters.AddWithValue("@pubAt", publishedAt);
                    cmd.Parameters.AddWithValue("@upAt", now);
                    cmd.ExecuteNonQuery();
                }

                return Task.FromResult<(bool, JsonNode?, string?)>((true, node, null));
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, ex.Message));
            }
        }

        public static Task<(bool Success, int Likes, bool IsLiked, string? Error)> LikeCommunityProjectAsync(string id, string rawJson)
        {
            try
            {
                string userId = "guest";
                if (!string.IsNullOrWhiteSpace(rawJson))
                {
                    var bodyNode = JsonNode.Parse(rawJson);
                    userId = bodyNode?["userId"]?.GetValue<string>() ?? "guest";
                }

                if (userId == "guest") return Task.FromResult<(bool, int, bool, string?)>((false, 0, false, "Musisz być zalogowany, aby polubić projekt."));

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();

                    string likedByStr = "[]";
                    using (var getCmd = conn.CreateCommand())
                    {
                        getCmd.CommandText = "SELECT liked_by FROM community_projects WHERE id = @id;";
                        getCmd.Parameters.AddWithValue("@id", id);
                        var obj = getCmd.ExecuteScalar();
                        if (obj == null) return Task.FromResult<(bool, int, bool, string?)>((false, 0, false, "Nie znaleziono projektu."));
                        likedByStr = obj.ToString() ?? "[]";
                    }

                    var likedByArray = JsonNode.Parse(likedByStr) as JsonArray ?? new JsonArray();
                    bool alreadyLiked = false;
                    int removeIdx = -1;
                    for (int i = 0; i < likedByArray.Count; i++)
                    {
                        if (likedByArray[i]?.GetValue<string>() == userId)
                        {
                            alreadyLiked = true;
                            removeIdx = i;
                            break;
                        }
                    }

                    bool isLiked;
                    if (alreadyLiked)
                    {
                        likedByArray.RemoveAt(removeIdx);
                        isLiked = false;
                    }
                    else
                    {
                        likedByArray.Add(userId);
                        isLiked = true;
                    }

                    int count = likedByArray.Count;
                    using (var updateCmd = conn.CreateCommand())
                    {
                        updateCmd.CommandText = "UPDATE community_projects SET likes = @likes, liked_by = @likedBy WHERE id = @id;";
                        updateCmd.Parameters.AddWithValue("@likes", count);
                        updateCmd.Parameters.AddWithValue("@likedBy", likedByArray.ToJsonString());
                        updateCmd.Parameters.AddWithValue("@id", id);
                        updateCmd.ExecuteNonQuery();
                    }

                    return Task.FromResult<(bool, int, bool, string?)>((true, count, isLiked, null));
                }
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, int, bool, string?)>((false, 0, false, ex.Message));
            }
        }

        public static Task<bool> DeleteCommunityProjectAsync(string id)
        {
            try
            {
                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "DELETE FROM community_projects WHERE id = @id;";
                    cmd.Parameters.AddWithValue("@id", id);
                    return Task.FromResult(cmd.ExecuteNonQuery() > 0);
                }
            }
            catch
            {
                return Task.FromResult(false);
            }
        }

        public static Task<List<JsonNode>> GetCommentsAsync(string projectId)
        {
            var result = new List<JsonNode>();
            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM comments WHERE project_id = @pid ORDER BY created_at ASC;";
                cmd.Parameters.AddWithValue("@pid", projectId);
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    var c = new JsonObject
                    {
                        ["id"] = reader["id"].ToString(),
                        ["projectId"] = reader["project_id"].ToString(),
                        ["userId"] = reader["user_id"].ToString(),
                        ["username"] = reader["username"].ToString(),
                        ["text"] = reader["text"].ToString(),
                        ["createdAt"] = reader["created_at"].ToString()
                    };
                    result.Add(c);
                }
            }
            return Task.FromResult(result);
        }

        public static Task<(bool Success, JsonNode? Comment, string? Error)> AddCommentAsync(string projectId, string rawJson)
        {
            try
            {
                var node = JsonNode.Parse(rawJson);
                if (node == null) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Nieprawidłowe dane komentarza."));

                string text = (node["text"]?.GetValue<string>() ?? "").Trim();
                if (string.IsNullOrWhiteSpace(text)) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Komentarz nie może być pusty."));

                string id = "cmt_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "_" + Guid.NewGuid().ToString("N")[..4];
                string userId = node["userId"]?.GetValue<string>() ?? "guest";
                string username = node["username"]?.GetValue<string>() ?? "Gość";
                string createdAt = DateTime.UtcNow.ToString("o");

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO comments (id, project_id, user_id, username, text, created_at)
                        VALUES (@id, @pid, @uid, @username, @text, @createdAt);
                    ";
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@pid", projectId);
                    cmd.Parameters.AddWithValue("@uid", userId);
                    cmd.Parameters.AddWithValue("@username", username);
                    cmd.Parameters.AddWithValue("@text", text);
                    cmd.Parameters.AddWithValue("@createdAt", createdAt);
                    cmd.ExecuteNonQuery();
                }

                var res = new JsonObject
                {
                    ["id"] = id,
                    ["projectId"] = projectId,
                    ["userId"] = userId,
                    ["username"] = username,
                    ["text"] = text,
                    ["createdAt"] = createdAt
                };
                return Task.FromResult<(bool, JsonNode?, string?)>((true, res, null));
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, ex.Message));
            }
        }

        public static Task<(bool Success, JsonNode? User, string? Error)> RegisterUserAsync(string rawJson)
        {
            try
            {
                var body = JsonNode.Parse(rawJson);
                string username = (body?["username"]?.GetValue<string>() ?? "").Trim();
                string password = body?["password"]?.GetValue<string>() ?? "";

                if (username.Length < 3) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Nazwa użytkownika musi mieć co najmniej 3 znaki."));
                if (password.Length < 3) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Hasło musi mieć co najmniej 3 znaki."));

                string id = "usr_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "_" + Guid.NewGuid().ToString("N")[..4];
                string hash = HashPassword(password);
                string createdAt = DateTime.UtcNow.ToString("o");

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();

                    using (var checkCmd = conn.CreateCommand())
                    {
                        checkCmd.CommandText = "SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(@u);";
                        checkCmd.Parameters.AddWithValue("@u", username);
                        if (Convert.ToInt64(checkCmd.ExecuteScalar()) > 0)
                        {
                            return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Użytkownik o takiej nazwie już istnieje."));
                        }
                    }

                    using (var insertCmd = conn.CreateCommand())
                    {
                        insertCmd.CommandText = @"
                            INSERT INTO users (id, username, password_hash, created_at, avatar_icon, avatar_color, bio, featured_enabled, featured_project_ids)
                            VALUES (@id, @username, @hash, @createdAt, 'fa-user-astronaut', '#ffd700', '', 1, '[]');
                        ";
                        insertCmd.Parameters.AddWithValue("@id", id);
                        insertCmd.Parameters.AddWithValue("@username", username);
                        insertCmd.Parameters.AddWithValue("@hash", hash);
                        insertCmd.Parameters.AddWithValue("@createdAt", createdAt);
                        insertCmd.ExecuteNonQuery();
                    }
                }

                var safeUser = new JsonObject
                {
                    ["id"] = id,
                    ["username"] = username,
                    ["createdAt"] = createdAt,
                    ["avatarIcon"] = "fa-user-astronaut",
                    ["avatarColor"] = "#ffd700",
                    ["bio"] = "",
                    ["featuredEnabled"] = true,
                    ["featuredProjectIds"] = new JsonArray()
                };

                return Task.FromResult<(bool, JsonNode?, string?)>((true, safeUser, null));
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, ex.Message));
            }
        }

        public static Task<(bool Success, JsonNode? User, string? Error)> LoginUserAsync(string rawJson)
        {
            try
            {
                var body = JsonNode.Parse(rawJson);
                string username = (body?["username"]?.GetValue<string>() ?? "").Trim();
                string password = body?["password"]?.GetValue<string>() ?? "";

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "SELECT * FROM users WHERE LOWER(username) = LOWER(@u);";
                    cmd.Parameters.AddWithValue("@u", username);
                    using var reader = cmd.ExecuteReader();
                    if (reader.Read())
                    {
                        string storedHash = reader["password_hash"].ToString() ?? "";
                        if (VerifyPassword(password, storedHash))
                        {
                            var user = new JsonObject
                            {
                                ["id"] = reader["id"].ToString(),
                                ["username"] = reader["username"].ToString(),
                                ["createdAt"] = reader["created_at"].ToString(),
                                ["avatarIcon"] = reader["avatar_icon"]?.ToString() ?? "fa-user-astronaut",
                                ["avatarColor"] = reader["avatar_color"]?.ToString() ?? "#ffd700",
                                ["bio"] = reader["bio"]?.ToString() ?? "",
                                ["featuredEnabled"] = Convert.ToInt32(reader["featured_enabled"] == DBNull.Value ? 1 : reader["featured_enabled"]) == 1,
                                ["featuredProjectIds"] = JsonNode.Parse(reader["featured_project_ids"]?.ToString() ?? "[]") ?? new JsonArray()
                            };
                            return Task.FromResult<(bool, JsonNode?, string?)>((true, user, null));
                        }
                    }
                }

                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Nieprawidłowa nazwa użytkownika lub hasło."));
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, ex.Message));
            }
        }

        public static Task<(bool Success, JsonNode? User, string? Error)> UpdateUserProfileAsync(string rawJson)
        {
            try
            {
                var body = JsonNode.Parse(rawJson);
                string id = body?["id"]?.GetValue<string>() ?? "";
                if (string.IsNullOrWhiteSpace(id)) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Brak ID użytkownika."));

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();

                    using var getCmd = conn.CreateCommand();
                    getCmd.CommandText = "SELECT * FROM users WHERE id = @id;";
                    getCmd.Parameters.AddWithValue("@id", id);
                    using var reader = getCmd.ExecuteReader();
                    if (!reader.Read()) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Użytkownik nie istnieje."));

                    string avatarIcon = body?["avatarIcon"]?.GetValue<string>() ?? reader["avatar_icon"].ToString() ?? "fa-user-astronaut";
                    string avatarColor = body?["avatarColor"]?.GetValue<string>() ?? reader["avatar_color"].ToString() ?? "#ffd700";
                    string bio = body?["bio"] != null ? body["bio"]!.GetValue<string>() : (reader["bio"].ToString() ?? "");
                    bool featuredEnabled = body?["featuredEnabled"] != null ? body["featuredEnabled"]!.GetValue<bool>() : (Convert.ToInt32(reader["featured_enabled"] == DBNull.Value ? 1 : reader["featured_enabled"]) == 1);
                    string featuredProjectIds = body?["featuredProjectIds"] != null ? body["featuredProjectIds"]!.ToJsonString() : (reader["featured_project_ids"]?.ToString() ?? "[]");
                    string username = reader["username"].ToString() ?? "";
                    string createdAt = reader["created_at"].ToString() ?? "";
                    reader.Close();

                    using var updateCmd = conn.CreateCommand();
                    updateCmd.CommandText = @"
                        UPDATE users
                        SET avatar_icon = @avatarIcon, avatar_color = @avatarColor, bio = @bio, featured_enabled = @fe, featured_project_ids = @fids
                        WHERE id = @id;
                    ";
                    updateCmd.Parameters.AddWithValue("@avatarIcon", avatarIcon);
                    updateCmd.Parameters.AddWithValue("@avatarColor", avatarColor);
                    updateCmd.Parameters.AddWithValue("@bio", bio);
                    updateCmd.Parameters.AddWithValue("@fe", featuredEnabled ? 1 : 0);
                    updateCmd.Parameters.AddWithValue("@fids", featuredProjectIds);
                    updateCmd.Parameters.AddWithValue("@id", id);
                    updateCmd.ExecuteNonQuery();

                    var safeUser = new JsonObject
                    {
                        ["id"] = id,
                        ["username"] = username,
                        ["createdAt"] = createdAt,
                        ["avatarIcon"] = avatarIcon,
                        ["avatarColor"] = avatarColor,
                        ["bio"] = bio,
                        ["featuredEnabled"] = featuredEnabled,
                        ["featuredProjectIds"] = JsonNode.Parse(featuredProjectIds) ?? new JsonArray()
                    };
                    return Task.FromResult<(bool, JsonNode?, string?)>((true, safeUser, null));
                }
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, ex.Message));
            }
        }

        public static Task<JsonNode?> GetUserPublicProfileAsync(string userId)
        {
            try
            {
                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "SELECT id, username, created_at, avatar_icon, avatar_color, bio, featured_enabled, featured_project_ids FROM users WHERE id = @id OR LOWER(username) = LOWER(@id);";
                    cmd.Parameters.AddWithValue("@id", userId);
                    using var reader = cmd.ExecuteReader();
                    if (reader.Read())
                    {
                        var user = new JsonObject
                        {
                            ["id"] = reader["id"].ToString(),
                            ["username"] = reader["username"].ToString(),
                            ["createdAt"] = reader["created_at"].ToString(),
                            ["avatarIcon"] = reader["avatar_icon"]?.ToString() ?? "fa-user-astronaut",
                            ["avatarColor"] = reader["avatar_color"]?.ToString() ?? "#ffd700",
                            ["bio"] = reader["bio"]?.ToString() ?? "",
                            ["featuredEnabled"] = Convert.ToInt32(reader["featured_enabled"] == DBNull.Value ? 1 : reader["featured_enabled"]) == 1,
                            ["featuredProjectIds"] = JsonNode.Parse(reader["featured_project_ids"]?.ToString() ?? "[]") ?? new JsonArray()
                        };
                        return Task.FromResult<JsonNode?>(user);
                    }
                }
            }
            catch { }
            return Task.FromResult<JsonNode?>(null);
        }

        public static Task<List<JsonNode>> GetUserProjectsAsync(string userId)
        {
            var result = new List<JsonNode>();
            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM user_projects WHERE user_id = @uid ORDER BY updated_at DESC;";
                cmd.Parameters.AddWithValue("@uid", userId);
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    try
                    {
                        var node = new JsonObject
                        {
                            ["id"] = reader["id"].ToString(),
                            ["userId"] = reader["user_id"].ToString(),
                            ["author"] = reader["author"].ToString(),
                            ["name"] = reader["name"].ToString(),
                            ["description"] = reader["description"].ToString(),
                            ["tags"] = JsonNode.Parse(reader["tags"].ToString() ?? "[]") ?? new JsonArray(),
                            ["width"] = Convert.ToInt32(reader["width"]),
                            ["height"] = Convert.ToInt32(reader["height"]),
                            ["fps"] = Convert.ToInt32(reader["fps"]),
                            ["palette"] = JsonNode.Parse(reader["palette"].ToString() ?? "[]") ?? new JsonArray(),
                            ["frames"] = JsonNode.Parse(reader["frames"].ToString() ?? "[]") ?? new JsonArray(),
                            ["createdAt"] = reader["created_at"].ToString(),
                            ["updatedAt"] = reader["updated_at"].ToString()
                        };
                        result.Add(node);
                    }
                    catch { }
                }
            }
            return Task.FromResult(result);
        }

        public static Task<(bool Success, JsonNode? Project, string? Error)> SaveUserProjectAsync(string userId, string rawJson)
        {
            try
            {
                var node = JsonNode.Parse(rawJson);
                if (node == null) return Task.FromResult<(bool, JsonNode?, string?)>((false, null, "Nieprawidłowy JSON."));

                string id = node["id"]?.GetValue<string>() ?? ("pah_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                string author = node["author"]?.GetValue<string>() ?? "Twórca";
                string name = node["name"]?.GetValue<string>() ?? "Projekt";
                string description = node["description"]?.GetValue<string>() ?? "";
                string tags = (node["tags"] as JsonArray)?.ToJsonString() ?? "[]";
                int width = node["width"]?.GetValue<int>() ?? 16;
                int height = node["height"]?.GetValue<int>() ?? 16;
                int fps = node["fps"]?.GetValue<int>() ?? 8;
                string palette = (node["palette"] as JsonArray)?.ToJsonString() ?? "[]";
                string frames = (node["frames"] as JsonArray)?.ToJsonString() ?? "[]";
                string now = DateTime.UtcNow.ToString("o");
                string createdAt = node["createdAt"]?.GetValue<string>() ?? now;

                node["id"] = id;
                node["updatedAt"] = now;

                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO user_projects (id, user_id, author, name, description, tags, width, height, fps, palette, frames, created_at, updated_at)
                        VALUES (@id, @uid, @author, @name, @desc, @tags, @w, @h, @fps, @pal, @frames, @createdAt, @upAt)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            description = excluded.description,
                            tags = excluded.tags,
                            width = excluded.width,
                            height = excluded.height,
                            fps = excluded.fps,
                            palette = excluded.palette,
                            frames = excluded.frames,
                            updated_at = excluded.updated_at;
                    ";
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@uid", userId);
                    cmd.Parameters.AddWithValue("@author", author);
                    cmd.Parameters.AddWithValue("@name", name);
                    cmd.Parameters.AddWithValue("@desc", description);
                    cmd.Parameters.AddWithValue("@tags", tags);
                    cmd.Parameters.AddWithValue("@w", width);
                    cmd.Parameters.AddWithValue("@h", height);
                    cmd.Parameters.AddWithValue("@fps", fps);
                    cmd.Parameters.AddWithValue("@pal", palette);
                    cmd.Parameters.AddWithValue("@frames", frames);
                    cmd.Parameters.AddWithValue("@createdAt", createdAt);
                    cmd.Parameters.AddWithValue("@upAt", now);
                    cmd.ExecuteNonQuery();
                }

                return Task.FromResult<(bool, JsonNode?, string?)>((true, node, null));
            }
            catch (Exception ex)
            {
                return Task.FromResult<(bool, JsonNode?, string?)>((false, null, ex.Message));
            }
        }

        public static Task<bool> DeleteUserProjectAsync(string userId, string projectId)
        {
            try
            {
                lock (_dbLock)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "DELETE FROM user_projects WHERE id = @id AND user_id = @uid;";
                    cmd.Parameters.AddWithValue("@id", projectId);
                    cmd.Parameters.AddWithValue("@uid", userId);
                    return Task.FromResult(cmd.ExecuteNonQuery() > 0);
                }
            }
            catch
            {
                return Task.FromResult(false);
            }
        }

        private static string HashPassword(string password)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
            return Convert.ToHexString(bytes);
        }

        private static bool VerifyPassword(string password, string storedHash)
        {
            if (string.IsNullOrEmpty(storedHash)) return false;
            string sha = HashPassword(password);
            if (string.Equals(sha, storedHash, StringComparison.OrdinalIgnoreCase)) return true;
            try
            {
                string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(password));
                if (string.Equals(b64, storedHash, StringComparison.Ordinal)) return true;
            }
            catch { }
            return false;
        }
    }
}
