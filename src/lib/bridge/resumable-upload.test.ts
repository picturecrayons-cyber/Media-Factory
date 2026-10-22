import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commitMultipart,
  startMultipart,
  uploadMultipartPart,
} from "./resumable-upload.ts";

type RequestRecord = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Blob | null;
};

class FakeXhr {
  static requests: RequestRecord[] = [];
  static nextResponse = "";
  static nextStatus = 200;
  status = 0;
  responseText = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private headers: Record<string, string> = {};
  private responseHeaders: Record<string, string> = { etag: '"part-etag"' };
  private request: RequestRecord = { method: "", url: "", headers: {}, body: null };

  open(method: string, url: string) {
    this.request.method = method;
    this.request.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    this.request.headers[name.toLowerCase()] = value;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  send(body: Blob | null) {
    this.request.body = body;
    FakeXhr.requests.push(this.request);
    this.status = FakeXhr.nextStatus;
    this.responseText = FakeXhr.nextResponse;
    queueMicrotask(() => this.onload?.());
  }
}

test("multipart initiation resolves OCI accessUri against the PAR host and sends required header", async (t) => {
  const original = globalThis.XMLHttpRequest;
  FakeXhr.requests = [];
  FakeXhr.nextResponse = JSON.stringify({ accessUri: "/p/par-token/n/ns/b/bucket/u/object/id/upload-id/" });
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = original; });

  const par = "https://objectstorage.ap-mumbai-1.oraclecloud.com/p/par-token/n/ns/b/bucket/o/object";
  const result = await startMultipart(par, "video/mp4");

  assert.equal(result, "https://objectstorage.ap-mumbai-1.oraclecloud.com/p/par-token/n/ns/b/bucket/u/object/id/upload-id/");
  assert.equal(FakeXhr.requests[0].method, "PUT");
  assert.equal(FakeXhr.requests[0].headers["opc-multipart"], "true");
  assert.equal(FakeXhr.requests[0].headers["content-type"], "video/mp4");
});

test("multipart part upload sends the requested slice and requires the OCI ETag", async (t) => {
  const original = globalThis.XMLHttpRequest;
  FakeXhr.requests = [];
  FakeXhr.nextResponse = "";
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = original; });

  const file = new Blob([new Uint8Array(10)]) as File;
  const result = await uploadMultipartPart("https://storage.example/u/object/id/upload/", file, 2, 4);

  assert.deepEqual(result, { number: 2, etag: "part-etag", size: 4 });
  assert.equal(FakeXhr.requests[0].method, "PUT");
  assert.equal(FakeXhr.requests[0].url, "https://storage.example/u/object/id/upload/2");
  assert.equal(FakeXhr.requests[0].body?.size, 4);
  assert.equal(FakeXhr.requests[0].headers["content-type"], "application/octet-stream");

  class MissingEtagXhr extends FakeXhr {
    getResponseHeader(_name: string): string { return ""; }
  }
  globalThis.XMLHttpRequest = MissingEtagXhr as unknown as typeof XMLHttpRequest;
  await assert.rejects(
    uploadMultipartPart("https://storage.example/u/object/id/upload/", file, 1, 4),
    /did not expose the uploaded part ETag/,
  );
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
});

test("multipart commit posts to the upload access URI", async (t) => {
  const original = globalThis.XMLHttpRequest;
  FakeXhr.requests = [];
  FakeXhr.nextResponse = "";
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = original; });

  const url = "https://storage.example/p/par-token/n/ns/b/bucket/u/object/id/upload/";
  await commitMultipart(url);
  assert.equal(FakeXhr.requests[0].method, "POST");
  assert.equal(FakeXhr.requests[0].url, url);
  assert.equal(FakeXhr.requests[0].body, null);
});
