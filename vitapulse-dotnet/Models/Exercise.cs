using System.ComponentModel.DataAnnotations;
namespace FitnessTracker.Api.Models;
public sealed class Exercise { public int Id {get;set;} [MaxLength(100)] public string Name {get;set;}=""; public int Duration {get;set;} public int Calories {get;set;} [MaxLength(40)] public string Category {get;set;}="TRAINING"; [MaxLength(300)] public string Description {get;set;}=""; }
