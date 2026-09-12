// Command mockadapter is the reference adapter implementation: the
// simplest possible thing that speaks proto/core/v1/core.proto correctly.
// It exists for two reasons:
//  1. A concrete example to copy when writing a real platform adapter
//     (Slack/Telegram/Discord) — see ARCHITECTURE.md for those SDKs.
//  2. The counterpart test/e2e/core_adapter_test.go connects against a
//     coreserver instance using this binary, so the e2e suite proves the
//     real wire contract works, not just the core's internal logic.
//
// Behavior: connects to the core over the given Unix socket, sends Hello,
// then relays whatever it receives on stdin as an InboundMessage and prints
// whatever OutboundMessage/ApprovalRequest comes back. No real platform
// call ever happens here — that's the point of it being the reference/mock.
package main

import "fmt"

func main() {
	fmt.Println("mockadapter: placeholder — run `make proto` and uncomment the real implementation below")
}

// NOTE: depends on generated code from proto/core/v1/core.proto, same as
// internal/core/server.go — run `make proto` first. Left as pseudocode
// below rather than a stub main() so the shape of a minimal real adapter is
// visible in one place.
//
// import (
// 	"bufio"
// 	"context"
// 	"fmt"
// 	"os"
//
// 	corev1 "github.com/YOURNAME/agentic-gateway/gen/core/v1"
// 	"google.golang.org/grpc"
// 	"google.golang.org/grpc/credentials/insecure"
// )
//
// func main() {
// 	socketPath := os.Getenv("AGENTIC_GATEWAY_SOCKET")
// 	if socketPath == "" {
// 		socketPath = "/tmp/agentic-gateway.sock"
// 	}
//
// 	conn, err := grpc.NewClient("unix://"+socketPath, grpc.WithTransportCredentials(insecure.NewCredentials()))
// 	if err != nil {
// 		panic(err)
// 	}
// 	defer conn.Close()
//
// 	client := corev1.NewAdapterGatewayClient(conn)
// 	stream, err := client.Connect(context.Background())
// 	if err != nil {
// 		panic(err)
// 	}
//
// 	err = stream.Send(&corev1.AdapterEnvelope{Payload: &corev1.AdapterEnvelope_Hello{
// 		Hello: &corev1.Hello{AdapterName: "mockadapter", AdapterVersion: "0.0.1", ContractVersion: "0.1.0"},
// 	}})
// 	if err != nil {
// 		panic(err)
// 	}
//
// 	go func() {
// 		for {
// 			envelope, err := stream.Recv()
// 			if err != nil {
// 				return
// 			}
// 			fmt.Printf("core -> adapter: %+v\n", envelope)
// 		}
// 	}()
//
// 	scanner := bufio.NewScanner(os.Stdin)
// 	for scanner.Scan() {
// 		_ = stream.Send(&corev1.AdapterEnvelope{Payload: &corev1.AdapterEnvelope_InboundMessage{
// 			InboundMessage: &corev1.InboundMessage{
// 				PrincipalID:    "default",
// 				ConversationID: "mockadapter-stdin",
// 				Text:           scanner.Text(),
// 			},
// 		}})
// 	}
// }
