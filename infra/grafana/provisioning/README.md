Grafana datasource/dashboard provisioning YAML goes here (not populated yet —
see the Observability gap noted in the root README). Once `/metrics` is
wired up on the API, add a datasource pointing at the `prometheus` service
and a dashboard-provider pointing at `../dashboards`.
