import { http, HttpResponse } from "msw";

// Mock Firestore REST API handlers
export const handlers = [
  // Mock Firestore document read
  http.get("https://firestore.googleapis.com/v1/projects/*/databases/*/documents/*", () => {
    return HttpResponse.json({
      documents: [],
    });
  }),

  // Mock Firestore document write
  http.post("https://firestore.googleapis.com/v1/projects/*/databases/*/documents/*", () => {
    return HttpResponse.json(
      {
        name: "projects/test/databases/(default)/documents/test/123",
        fields: {},
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      },
      { status: 200 },
    );
  }),

  // Mock Firestore document update
  http.patch("https://firestore.googleapis.com/v1/projects/*/databases/*/documents/*", () => {
    return HttpResponse.json(
      {
        name: "projects/test/databases/(default)/documents/test/123",
        fields: {},
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      },
      { status: 200 },
    );
  }),

  // Mock Firestore batch write
  http.post(
    "https://firestore.googleapis.com/v1/projects/*/databases/*/documents:batchWrite",
    () => {
      return HttpResponse.json({
        writeResults: [],
        status: 200,
      });
    },
  ),

  // Mock Firestore runQuery
  http.post("https://firestore.googleapis.com/v1/projects/*/databases/*/documents:runQuery", () => {
    return HttpResponse.json([], { status: 200 });
  }),

  // Mock Firebase Auth
  http.post("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword", () => {
    return HttpResponse.json(
      {
        idToken: "mock-id-token",
        email: "test@test.com",
        refreshToken: "mock-refresh-token",
        expiresIn: "3600",
        localId: "test-uid",
        registered: true,
      },
      { status: 200 },
    );
  }),

  http.post("https://identitytoolkit.googleapis.com/v1/accounts:signUp", () => {
    return HttpResponse.json(
      {
        idToken: "mock-id-token",
        email: "test@test.com",
        refreshToken: "mock-refresh-token",
        expiresIn: "3600",
        localId: "test-uid",
      },
      { status: 200 },
    );
  }),

  http.post("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp", () => {
    return HttpResponse.json(
      {
        idToken: "mock-id-token",
        email: "test@test.com",
        refreshToken: "mock-refresh-token",
        expiresIn: "3600",
        localId: "test-uid",
        registered: true,
      },
      { status: 200 },
    );
  }),

  // Mock Firebase Functions
  http.post("https://extract-ocr-*.run.app", () => {
    return HttpResponse.json(
      {
        success: true,
        ocr: {
          blocks: [],
          full_text: "Mock OCR text",
        },
        parsed: {
          rfc: "TEST123456789",
          total: 1000,
        },
        tipo: "cfdi",
      },
      { status: 200 },
    );
  }),

  http.get("https://health-*.run.app", () => {
    return HttpResponse.json(
      {
        status: "ok",
        service: "paddle-ocr",
      },
      { status: 200 },
    );
  }),
];
