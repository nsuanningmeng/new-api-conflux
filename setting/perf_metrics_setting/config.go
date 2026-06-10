package perf_metrics_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type PerfMetricsSetting struct {
	Enabled               bool    `json:"enabled"`
	FlushInterval         int     `json:"flush_interval"`
	BucketTime            string  `json:"bucket_time"`
	RetentionDays         int     `json:"retention_days"`
	ErrorStatusCodes      string  `json:"error_status_codes"`
	SuccessThresholdGreen float64 `json:"success_threshold_green"`
	SuccessThresholdRed   float64 `json:"success_threshold_red"`
}

var perfMetricsSetting = PerfMetricsSetting{
	Enabled:               true,
	FlushInterval:         5,
	BucketTime:            "hour",
	RetentionDays:         0,
	ErrorStatusCodes:      "",
	SuccessThresholdGreen: 99.9,
	SuccessThresholdRed:   99.0,
}

func init() {
	config.GlobalConfig.Register("perf_metrics_setting", &perfMetricsSetting)
}

func GetSetting() PerfMetricsSetting {
	return perfMetricsSetting
}

func GetBucketSeconds() int64 {
	switch perfMetricsSetting.BucketTime {
	case "minute":
		return 60
	case "5min":
		return 300
	case "hour":
		return 3600
	default:
		return 3600
	}
}

func GetFlushIntervalMinutes() int {
	if perfMetricsSetting.FlushInterval < 1 {
		return 1
	}
	return perfMetricsSetting.FlushInterval
}

// IsErrorStatusCode returns whether the given HTTP status code should be
// counted as an error. 200 is always excluded. If ErrorStatusCodes is empty,
// all non-2xx codes are errors; otherwise only codes matching the configured
// codes/ranges (e.g. "500,429" or "500-599") are errors. An unparsable value
// falls back to the empty-list behavior instead of disabling error accounting.
func IsErrorStatusCode(statusCode int) bool {
	if statusCode == 200 {
		return false
	}
	nonSuccess := statusCode < 200 || statusCode >= 300
	raw := strings.TrimSpace(perfMetricsSetting.ErrorStatusCodes)
	if raw == "" {
		return nonSuccess
	}
	ranges, err := operation_setting.ParseHTTPStatusCodeRanges(raw)
	if err != nil || len(ranges) == 0 {
		return nonSuccess
	}
	for _, r := range ranges {
		if statusCode >= r.Start && statusCode <= r.End {
			return true
		}
	}
	return false
}

func GetSuccessThresholds() (green, red float64) {
	g := perfMetricsSetting.SuccessThresholdGreen
	r := perfMetricsSetting.SuccessThresholdRed
	if g <= 0 {
		g = 99.9
	}
	if r <= 0 {
		r = 99.0
	}
	// Ensure green > red; if misconfigured, clamp green to red+0.1
	if g <= r {
		g = r + 0.1
	}
	return g, r
}
