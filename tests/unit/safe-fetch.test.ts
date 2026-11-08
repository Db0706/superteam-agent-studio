import { describe, expect, it } from "vitest";
import { isPublicAddress } from "@/core/verification/safe-fetch";

describe("isPublicAddress", () => {
  it("allows public IPv4 and IPv6 addresses (Vercel, Cloudflare, Google, Railway, Render)", () => {
    for (const ip of ["216.198.79.3", "76.76.21.21", "104.16.132.229", "8.8.8.8", "34.111.139.176", "216.24.57.1", "2606:4700::6810:84e5", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("blocks private, loopback, link-local, CGNAT, metadata, multicast and reserved addresses", () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.3.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1", "198.18.0.1", "::1", "::", "fe80::1", "fd00::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "not-an-ip"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});
