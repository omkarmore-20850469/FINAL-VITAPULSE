using System.ComponentModel.DataAnnotations;
namespace FitnessTracker.Api.Models;
public sealed class User { public int Id {get;set;} [MaxLength(80)] public string DisplayName {get;set;}=""; [MaxLength(254)] public string Email {get;set;}=""; public string PasswordHash {get;set;}=""; public DateTime CreatedAt {get;set;}=DateTime.UtcNow; public List<Workout> Workouts {get;set;}=[]; }
