using System.ComponentModel.DataAnnotations;
namespace FitnessTracker.Api.DTOs;
public sealed record CreateWorkoutRequest([Range(1,int.MaxValue)] int ExerciseId,[Range(1,600)] int Duration,[Range(0,10000)] int Calories,[Required,RegularExpression("^(completed|cancelled)$")] string State);
public sealed record WorkoutResponse(int Id,int ExerciseId,string Name,int Duration,int Calories,DateTime Date,string State);
public sealed record ExerciseResponse(string Id,string Name,int Duration,int Calories,string Category,string Description);
