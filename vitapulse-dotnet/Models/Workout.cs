using System.ComponentModel.DataAnnotations;
namespace FitnessTracker.Api.Models;
public sealed class Workout { public int Id {get;set;} public int UserId {get;set;} public User? User {get;set;} public int ExerciseId {get;set;} public Exercise? Exercise {get;set;} public int Duration {get;set;} public int Calories {get;set;} public DateTime Date {get;set;}=DateTime.UtcNow; [MaxLength(20)] public string State {get;set;}="completed"; }
