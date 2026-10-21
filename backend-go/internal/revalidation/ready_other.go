//go:build !linux

package revalidation

import "context"
import "errors"
import "io"

func RequestReady(_ context.Context, _, _ string) (*ReadyTicket, string) { return nil, "not_armed" }
func PeerIdentity(_ int) (Peer, error)                                   { return Peer{}, errors.New("unsupported") }
func RunReadyServer(_ string, _ io.Reader, _ io.Writer) error            { return errors.New("unsupported") }
