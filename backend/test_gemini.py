from services.ai_mapper import GeminiAIMapper


def test_gemini_generation() -> None:
    mapper = GeminiAIMapper()
    response = mapper.generate_text("Say 'Gemini test passed'. Keep it brief.")
    print("Gemini Response:", response)
    assert "passed" in response.lower()


if __name__ == "__main__":
    test_gemini_generation()
    print("Gemini test passed successfully!")
