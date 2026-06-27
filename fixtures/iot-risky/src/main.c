#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "MyWiFi";
const char* password = "hardcoded123";
const char* serverUrl = "http://api.example.com/data";

void setup() {
  WiFi.begin(ssid, password);
  HTTPClient http;
  http.begin(serverUrl);
  http.POST(data);
}
