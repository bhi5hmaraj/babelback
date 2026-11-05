import { bucket, defineRailway, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const audio = bucket("audio", { region: "sin" });
  const api = service("api", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    start: "npm start -w api",
    healthcheck: "/v1/health",
    preDeploy: "npm run migrate -w api && npm run import-seeds -w api",
    replicas: { "asia-southeast1-eqsg3a": 1 },
  });
  const web = service("web", {
    build: { buildEnvironment: "V3", builder: "RAILPACK", buildCommand: "npm run build -w web" },
    start: "npm start -w web",
    replicas: { "asia-southeast1-eqsg3a": 1 },
  });

  return project("babelback", {
    variables: { managed: false },
    resources: [Postgres, api, web, postgresVolume, audio],
  });
});
