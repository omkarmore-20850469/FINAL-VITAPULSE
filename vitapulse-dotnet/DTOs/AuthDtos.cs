using System.ComponentModel.DataAnnotations;
namespace FitnessTracker.Api.DTOs;
public sealed record RegisterRequest([Required,MinLength(2),MaxLength(80)] string DisplayName,[Required,EmailAddress,MaxLength(254)] string Email,[Required,MinLength(8),MaxLength(100)] string Password);
public sealed record LoginRequest([Required,EmailAddress] string Email,[Required,MinLength(1)] string Password);
public sealed record AuthResponse(string Token,string Email,string DisplayName);
