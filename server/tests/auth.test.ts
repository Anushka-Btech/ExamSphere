import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, closeDb, PASSWORDS, reseed } from "./helpers.js";
import { exec } from "../src/db.js";

beforeAll(reseed);
afterAll(closeDb);

describe("authentication", () => {
  it("logs in a seeded user, sets an httpOnly cookie and returns the DB role", async () => {
    const r = await request(app).post("/api/auth/login").send({
      identifier: "admin",
      password: PASSWORDS.admin,
    });

    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe("ADMIN");
    expect(String(r.headers["set-cookie"])).toMatch(/es_sid=.*HttpOnly/i);
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash/i);
  });

  it("accepts email as well as username", async () => {
    const r = await request(app).post("/api/auth/login").send({
      identifier: "admin@examsphere.edu",
      password: PASSWORDS.admin,
    });

    expect(r.status).toBe(200);
  });

  it("rejects a wrong password and an unknown user with the same message", async () => {
    const a = await request(app).post("/api/auth/login").send({
      identifier: "admin",
      password: "nope-nope",
    });

    const b = await request(app).post("/api/auth/login").send({
      identifier: "ghost",
      password: "nope-nope",
    });

    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it("validates input (400) before touching the database", async () => {
    const r = await request(app).post("/api/auth/login").send({
      identifier: "",
      password: "",
    });

    expect(r.status).toBe(400);
  });

  it("ignores a role supplied by the client", async () => {
    const r = await request(app).post("/api/auth/login").send({
      identifier: "aarav.sharma",
      password: PASSWORDS.student,
      role: "ADMIN",
    });

    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe("STUDENT");
  });

  it("blocks inactive accounts", async () => {
    try {
      await exec(
        "UPDATE users SET status = 'INACTIVE' WHERE username = 'diya.patel'",
      );

      const r = await request(app).post("/api/auth/login").send({
        identifier: "diya.patel",
        password: PASSWORDS.student,
      });

      expect(r.status).toBe(401);
    } finally {
      await exec(
        "UPDATE users SET status = 'ACTIVE' WHERE username = 'diya.patel'",
      );
    }
  });

  it("requires a session for /me and invalidates it server-side on logout", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);

    const loginResponse = await request(app).post("/api/auth/login").send({
      identifier: "aarav.sharma",
      password: PASSWORDS.student,
    });

    expect(loginResponse.status).toBe(200);

    const setCookie = loginResponse.headers["set-cookie"];

    const cookie = (
      Array.isArray(setCookie) ? setCookie[0] : (setCookie ?? "")
    ).split(";")[0];

    expect(cookie).toBeTruthy();

    const authenticatedResponse = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(authenticatedResponse.status).toBe(200);

    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);

    expect(logoutResponse.status).toBe(200);

    const replayResponse = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(replayResponse.status).toBe(401);
  });
});
