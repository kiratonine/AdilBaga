//go:build !linux

package revalidation

import "errors"

func MonotonicNS() (string, error)    { return "", errors.New("clock unsupported") }
func BootID() (string, error)         { return "", errors.New("boot unsupported") }
func Relay(string, RelayEvent) string { return "skipped" }
