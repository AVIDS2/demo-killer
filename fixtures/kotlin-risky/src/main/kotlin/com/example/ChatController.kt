package com.example

import org.springframework.web.bind.annotation.*

@RestController
class ChatController {
    @PostMapping("/api/chat")
    fun chat(@RequestBody body: Map<String, String>): Map<String, Any> {
        println("Chat request: ${body["message"]}")
        return mapOf("text" to "response")
    }

    @DeleteMapping("/api/admin/users")
    fun deleteUser(@RequestBody body: Map<String, String>): Map<String, Any> {
        println("Deleting user: ${body["userId"]}")
        return mapOf("ok" to true)
    }
}
