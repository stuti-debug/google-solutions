from services.ai_mapper import GeminiAIMapper


def test_gemini_vertex_ai() -> None:
    """Test that Vertex AI is properly initialized and can generate content."""
    mapper = GeminiAIMapper()
    # Simple sanity check: generate a trivial response
    response = mapper.generate_text("Respond with exactly: OK", temperature=0)
    assert isinstance(response, str)
    assert len(response) > 0
    print(f"Model response: {response}")


if __name__ == "__main__":
    test_gemini_vertex_ai()
    print("Vertex AI test passed")
