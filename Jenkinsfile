// ===================================================================
// Jenkinsfile (Final Production-Ready Version)
// This declarative pipeline automates the entire CI/CD process.
// ===================================================================

pipeline {
    // 1. Agent Configuration
    // Run this pipeline on any available agent.
    agent any

    // 2. Environment Variables
    // Define all necessary variables here for easy management.
    environment {
        AWS_REGION        = 'us-west-2'
        ECR_REGISTRY      = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME     = 'my-app-repo' // The correct repository name
        EKS_CLUSTER_NAME  = 'my-eks-cluster'
        
        // These will use the credentials securely stored in Jenkins.
        SONAR_CREDENTIALS = credentials('sonar-token')
        // The ID of the AWS credentials stored in Jenkins
        AWS_CREDENTIALS_ID = 'aws-credentials' 
    }

    // 3. Pipeline Stages
    stages {
        
        // ==========================================================
        // Stage 1: Checkout Code
        // Fetches the code from the specific branch being built.
        // ==========================================================
        stage('Checkout') {
            steps {
                script {
                    echo "Checking out code from branch: ${env.BRANCH_NAME}"
                    checkout scm
                }
            }
        }

        // ==========================================================
        // Stage 2: SonarQube Quality Check
        // ==========================================================
        stage('SonarQube Analysis') {
            steps {
                script {
                    // Make sure you've configured your SonarQube server in Manage Jenkins -> System Configuration
                    withSonarQubeEnv('MySonarQubeServer') { 
                        // The scanner will look for a 'sonar-project.properties' file in your repo root.
                        sh 'sonar-scanner'
                    }
                }
            }
            post {
                success {
                    script {
                        // This crucial step pauses the pipeline to wait for the analysis result
                        // and fails the build if the Quality Gate status is not 'OK'.
                        timeout(time: 1, unit: 'h') {
                            def qg = waitForQualityGate()
                            if (qg.status != 'OK') {
                                error "Pipeline aborted due to SonarQube Quality Gate failure: ${qg.status}"
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // Stage 3: Build, Scan & Push Application Images
        // This stage builds both frontend and backend images in parallel.
        // ==========================================================
        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') { // Work inside the 'backend' directory
                            script {
                                // Use BUILD_ID to create a unique tag for each build
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                
                                echo "Building Backend image: ${imageName}"
                                def backendImage = docker.build(imageName, '.')

                                echo "Scanning Backend image with Trivy..."
                                // Fail the build if any high or critical vulnerabilities are found
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                                // Login to ECR and push the image
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Backend image to ECR..."
                                    backendImage.push()
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') { // Work inside the 'frontend' directory
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                
                                echo "Building Frontend image: ${imageName}"
                                def frontendImage = docker.build(imageName, '.')

                                echo "Scanning Frontend image with Trivy..."
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"
                                
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Frontend image to ECR..."
                                    frontendImage.push()
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // Stage 4: Deploy to EKS using Helm
        // ==========================================================
        stage('Deploy to EKS') {
            steps {
                script {
                    // Use the withAWS block to automatically handle authentication
                    withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                        
                        echo "Configuring kubectl for EKS cluster: ${EKS_CLUSTER_NAME}"
                        sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${env.AWS_REGION}"

                        echo "Deploying application with Helm..."
                        // This command is idempotent: it upgrades the release if it exists, or installs it if it doesn't.
                        // We pass the unique image tags to the Helm chart using --set.
                        // This assumes you have a Helm chart in a './helm/my-app' directory.
                        sh """
                            helm upgrade --install my-app ./helm/my-app \
                                --namespace default \
                                --set backend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set backend.image.tag=3tier-nodejs-backend-${env.BUILD_ID} \
                                --set frontend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set frontend.image.tag=3tier-nodejs-frontend-${env.BUILD_ID}
                        """
                    }
                }
            }
        }
    }
}
