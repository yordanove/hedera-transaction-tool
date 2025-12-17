export function formatDataMetrics(data, fields) {
  for (const property in fields) {
    if (data.metrics[property]) {
      data.metrics[fields[property]] = data.metrics[property];
      delete data.metrics[property];
    }
  }
}

export const needed_properties = {
  'iteration_duration': 'Iteration Duration',
  'http_req_waiting': 'HTTP Request Waiting',
  'http_req_tls_handshaking': 'HTTP Request TLS handshaking',
  'http_req_sending': 'HTTP Request Sending',
  'http_req_receiving': 'HTTP Request Receiving',
  'http_req_duration{name:sign-transaction}': 'HTTP Request Duration Sign Transaction',
  'http_req_duration{name:ready-to-sign}': 'HTTP Request Duration Ready to Sign',
  'http_req_duration{name:all-transactions}': 'HTTP Request Duration All Transactions',
  'http_req_duration{name:history}': 'HTTP Request Duration History',
  'http_req_duration{name:notifications}': 'HTTP Request Duration Notifications',
  'http_req_duration{name:ready-to-approve}': 'HTTP Request Duration Ready to Approve',
  'http_req_duration': 'HTTP Request Duration',
  'http_req_connecting': 'HTTP Request Connecting',
  'http_req_blocked': 'HTTP Request Blocked',
  'group_duration': 'Group Duration',
  'http_req_failed': 'HTTP Request Failed',
  'ready-to-sign status 200': 'Ready to Sign status 200',
  'ready-to-sign response < 1s': 'Ready to Sign Response < 1s',
  'tab_all_transactions_duration': 'Tab Duration All Transactions',
  'tab_history_duration': 'Tab Duration History',
  'tab_notifications_duration': 'Tab Duration Notifications',
  'tab_ready_to_approve_duration': 'Tab Duration Ready To Approve',
  'tab_ready_to_sign_duration': 'Tab Duration Ready To Sign',
  'tab_load_success': 'Tab Load Success',
};
