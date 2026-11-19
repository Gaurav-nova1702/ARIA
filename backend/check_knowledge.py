
import chromadb

client = chromadb.PersistentClient(path="./chroma_store")

collection = client.get_collection(
    "conversations_gemini_embedding_001"
)

data = collection.peek(limit=20)

print("TOTAL VECTORS:", collection.count())

for i in range(len(data["ids"])):
    print("\n------------------------------")
    print("ID:", data["ids"][i])
    print("DOCUMENT:", data["documents"][i])
    print("METADATA:", data["metadatas"][i])
