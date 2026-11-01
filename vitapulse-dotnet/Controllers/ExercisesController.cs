using FitnessTracker.Api.Data;
using FitnessTracker.Api.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class ExercisesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ExerciseResponse>>> GetAll()
    {
        // Older local databases may still contain separate Yoga and Stretching rows.
        // Keep those rows so historical workouts retain valid foreign keys, but expose
        // only one combined recovery activity in the selectable workout library.
        var exercises = await db.Exercises
            .AsNoTracking()
            .Where(e => e.Name != "Yoga" && e.Name != "Stretching")
            .OrderBy(e => e.Id)
            .Select(e => new ExerciseResponse(
                e.Id.ToString(), e.Name, e.Duration, e.Calories, e.Category, e.Description))
            .ToListAsync();

        return Ok(exercises);
    }
}
