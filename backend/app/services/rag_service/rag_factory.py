from app.services.rag_service.local_rag_pipeline import LocalRAGPipeline

class RAGProviderFactory:
    @staticmethod
    def get_provider():
        return LocalRAGPipeline()
