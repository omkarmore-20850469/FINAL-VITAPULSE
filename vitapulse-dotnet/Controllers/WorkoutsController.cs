using System.Security.Claims;
using FitnessTracker.Api.Data;
using FitnessTracker.Api.DTOs;
using FitnessTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class WorkoutsController(AppDbContext db) : ControllerBase
{
    private int? CurrentUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(value, out var id) && id > 0 ? id : null;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<WorkoutResponse>>> GetAll()
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized(new { message = "Your session is invalid. Please sign in again." });

        // A JWT can remain in browser storage after a local database was changed or recreated.
        if (!await db.Users.AnyAsync(user => user.Id == userId.Value))
            return Unauthorized(new { message = "Your account session is no longer valid. Please sign in again." });

        var data = await db.Workouts.AsNoTracking()
            .Where(workout => workout.UserId == userId.Value)
            .Include(workout => workout.Exercise)
            .OrderByDescending(workout => workout.Date)
            .Select(workout => new WorkoutResponse(workout.Id, workout.ExerciseId,
                workout.Exercise!.Name, workout.Duration, workout.Calories, workout.Date, workout.State))
            .ToListAsync();

        return Ok(data);
    }

    [HttpPost]
    public async Task<ActionResult<WorkoutResponse>> Create(CreateWorkoutRequest request)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized(new { message = "Your session is invalid. Please sign in again." });

        var userExists = await db.Users.AnyAsync(user => user.Id == userId.Value);
        if (!userExists)
            return Unauthorized(new { message = "Your account session is no longer valid. Please sign in again." });

        var exercise = await db.Exercises.FindAsync(request.ExerciseId);
        if (exercise is null)
            return BadRequest(new { message = "The selected exercise no longer exists. Refresh the workout list and try again." });

        var workout = new Workout
        {
            UserId = userId.Value,
            ExerciseId = exercise.Id,
            Duration = request.Duration,
            Calories = request.Calories,
            State = request.State,
            Date = DateTime.UtcNow
        };

        db.Workouts.Add(workout);
        await db.SaveChangesAsync();

        return Ok(new WorkoutResponse(workout.Id, exercise.Id, exercise.Name,
            workout.Duration, workout.Calories, workout.Date, workout.State));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized(new { message = "Your session is invalid. Please sign in again." });

        if (!await db.Users.AnyAsync(user => user.Id == userId.Value))
            return Unauthorized(new { message = "Your account session is no longer valid. Please sign in again." });

        var workout = await db.Workouts.FirstOrDefaultAsync(item => item.Id == id && item.UserId == userId.Value);
        if (workout is null) return NotFound(new { message = "Workout not found." });

        db.Workouts.Remove(workout);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
