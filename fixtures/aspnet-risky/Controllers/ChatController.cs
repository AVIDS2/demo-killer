using Microsoft.AspNetCore.Mvc;

namespace AspNetRisky.Controllers;

[ApiController]
public class ChatController : ControllerBase
{
    [HttpPost("/api/chat")]
    public IActionResult Chat([FromBody] ChatRequest body)
    {
        Console.WriteLine($"Chat request: {body.Message}");
        return Ok(new { text = "response placeholder" });
    }

    [HttpDelete("/api/admin/users")]
    public IActionResult DeleteUser([FromBody] DeleteRequest body)
    {
        Console.WriteLine($"Deleting user: {body.UserId}");
        return Ok(new { ok = true });
    }

    [HttpPost("/api/stripe/webhook")]
    public IActionResult StripeWebhook([FromBody] Dictionary<string, object> event)
    {
        Console.WriteLine($"Webhook event: {event.GetValueOrDefault("type")}");
        return Ok(new { received = true });
    }
}

public class ChatRequest { public string Message { get; set; } = ""; }
public class DeleteRequest { public string UserId { get; set; } = ""; }
