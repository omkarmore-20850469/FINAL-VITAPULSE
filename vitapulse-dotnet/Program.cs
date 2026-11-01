using System.Text;
using System.Text.Json.Serialization;
using FitnessTracker.Api.Data;
using FitnessTracker.Api.Models;
using FitnessTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Resolve relative SQLite paths against the API project directory, not whichever
// directory happened to launch dotnet. This avoids accidentally opening a new DB.
var configuredConnection = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=vitapulse.db";
var sqliteConnection = new SqliteConnectionStringBuilder(configuredConnection);
if (!Path.IsPathRooted(sqliteConnection.DataSource))
{
    sqliteConnection.DataSource = Path.GetFullPath(
        sqliteConnection.DataSource, builder.Environment.ContentRootPath);
}
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(sqliteConnection.ToString()));

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT key is not configured.");
if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 bytes for HS256.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<TokenService>();
builder.Services.AddCors(options => options.AddPolicy("Angular", policy =>
    policy.WithOrigins("http://localhost:4200", "https://localhost:4200")
          .AllowAnyHeader()
          .AllowAnyMethod()));

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();

    // Seed only missing exercise names so existing local databases gain new activities safely.
    var starterExercises = new[]
    {
        new Exercise { Name = "Running", Duration = 30, Calories = 280, Category = "CARDIO", Description = "Find a comfortable rhythm and build endurance." },
        new Exercise { Name = "Cycling", Duration = 45, Calories = 350, Category = "CARDIO", Description = "A steady ride to get your energy moving." },
        new Exercise { Name = "Walking", Duration = 30, Calories = 140, Category = "LOW IMPACT", Description = "A low-pressure way to make movement part of your day." },
        new Exercise { Name = "Push Ups", Duration = 15, Calories = 120, Category = "STRENGTH", Description = "A simple bodyweight session for upper-body strength." },
        new Exercise { Name = "Squats", Duration = 20, Calories = 160, Category = "STRENGTH", Description = "Build lower-body strength one rep at a time." },
        new Exercise { Name = "Yoga & Stretching", Duration = 25, Calories = 100, Category = "RECOVERY", Description = "A calm recovery session combining gentle yoga poses, mobility, and stretching." }
    };
    foreach (var exercise in starterExercises)
    {
        if (!await db.Exercises.AnyAsync(existing => existing.Name == exercise.Name))
            db.Exercises.Add(exercise);
    }
    await db.SaveChangesAsync();
}

app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseCors("Angular");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "VitaPulse API" }));
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.Run();
