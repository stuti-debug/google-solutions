from services.ai_mapper import GeminiAIMapper


def test_gemini_json_roundtrip() -> None:
    mapper = GeminiAIMapper()
    models = list(mapper.client.models.list())
    assert isinstance(models, list)
    assert len(models) > 0


if __name__ == "__main__":
    test_gemini_json_roundtrip()
    print("Gemini test passed")
