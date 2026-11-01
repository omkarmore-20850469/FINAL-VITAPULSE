
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

// --------------------------------------------------
// 1. Controllers and JSON configuration
// --------------------------------------------------

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(
            new JsonStringEnumConverter()
        );
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// --------------------------------------------------
// 2. Database configuration (SQLite)
// --------------------------------------------------

var configuredConnection =
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=vitapulse.db";

var sqliteConnection =
    new SqliteConnectionStringBuilder(configuredConnection);

if (!Path.IsPathRooted(sqliteConnection.DataSource))
{
    sqliteConnection.DataSource = Path.GetFullPath(
        sqliteConnection.DataSource,
        builder.Environment.ContentRootPath
    );
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(sqliteConnection.ToString())
);

// --------------------------------------------------
// 3. JWT authentication configuration
// --------------------------------------------------

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException(
        "JWT key is not configured."
    );

if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException(
        "Jwt:Key must be at least 32 bytes for HS256."
    );
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters =
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,

                ValidIssuer =
                    builder.Configuration["Jwt:Issuer"],

                ValidAudience =
                    builder.Configuration["Jwt:Audience"],

                IssuerSigningKey =
                    new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtKey)
                    ),

                ClockSkew = TimeSpan.FromSeconds(30)
            };
    });

// --------------------------------------------------
// 4. Authorization and application services
// --------------------------------------------------

builder.Services.AddAuthorization();

builder.Services.AddScoped<TokenService>();

// --------------------------------------------------
// 5. CORS configuration
// --------------------------------------------------

builder.Services.AddCors(options =>
{
    options.AddPolicy("VitaPulsePolicy", policy =>
    {
        policy
            .WithOrigins(
                "https://final-vitapulse.vercel.app",
                "http://localhost:4200",
                "https://localhost:4200"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// --------------------------------------------------
// 6. Build application
// --------------------------------------------------

var app = builder.Build();

// --------------------------------------------------
// 7. Database initialization and exercise seeding
// --------------------------------------------------

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider
        .GetRequiredService<AppDbContext>();

    await db.Database.EnsureCreatedAsync();

    var starterExercises = new[]
    {
        new Exercise
        {
            Name = "Running",
            Duration = 30,
            Calories = 280,
            Category = "CARDIO",
            Description =
                "Find a comfortable rhythm and build endurance."
        },

        new Exercise
        {
            Name = "Cycling",
            Duration = 45,
            Calories = 350,
            Category = "CARDIO",
            Description =
                "A steady ride to get your energy moving."
        },

        new Exercise
        {
            Name = "Walking",
            Duration = 30,
            Calories = 140,
            Category = "LOW IMPACT",
            Description =
                "A low-pressure way to make movement part of your day."
        },

        new Exercise
        {
            Name = "Push Ups",
            Duration = 15,
            Calories = 120,
            Category = "STRENGTH",
            Description =
                "A simple bodyweight session for upper-body strength."
        },

        new Exercise
        {
            Name = "Squats",
            Duration = 20,
            Calories = 160,
            Category = "STRENGTH",
            Description =
                "Build lower-body strength one rep at a time."
        },

        new Exercise
        {
            Name = "Yoga & Stretching",
            Duration = 25,
            Calories = 100,
            Category = "RECOVERY",
            Description =
                "A calm recovery session combining gentle yoga poses, mobility, and stretching."
        }
    };

    foreach (var exercise in starterExercises)
    {
        var exists = await db.Exercises.AnyAsync(
            existing => existing.Name == exercise.Name
        );

        if (!exists)
        {
            db.Exercises.Add(exercise);
        }
    }

    await db.SaveChangesAsync();
}

// --------------------------------------------------
// 8. HTTP middleware
// --------------------------------------------------

app.UseMiddleware<ErrorHandlingMiddleware>();

app.UseHttpsRedirection();

// IMPORTANT: This must match the registered policy name.
app.UseCors("VitaPulsePolicy");

app.UseAuthentication();

app.UseAuthorization();

// --------------------------------------------------
// 9. API endpoints
// --------------------------------------------------

app.MapControllers();

// Health check endpoint
app.MapGet("/health", () =>
{
    return Results.Ok(new
    {
        status = "healthy",
        service = "VitaPulse API"
    });
});

// --------------------------------------------------
// 10. Swagger (development only)
// --------------------------------------------------

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// --------------------------------------------------
// 11. Start application
// --------------------------------------------------

app.Run();
